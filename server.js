const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const usersByToken = new Map();
const requests = [];

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getUserFromReq(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return usersByToken.get(token);
}

function getRequestById(id) {
  return requests.find((item) => item.id === id);
}

function summarizeOpenRequest(item) {
  return {
    id: item.id,
    from: item.from,
    to: item.to,
    amount: item.amount,
    createdAt: item.createdAt,
    status: item.status,
  };
}

function summarizeAssignedRequest(item, user) {
  const isCustomer = user.id === item.customerId;
  const otherUser = isCustomer ? item.transporter : item.customer;

  return {
    id: item.id,
    from: item.from,
    to: item.to,
    amount: item.amount,
    status: item.status,
    assignedAt: item.assignedAt,
    yourRole: isCustomer ? 'customer' : 'transporter',
    counterparty: {
      displayName: otherUser.name,
      phone: otherUser.phone,
    },
    messages: item.messages,
  };
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/signup' && req.method === 'POST') {
      try {
        const body = await parseBody(req);
        const { name, phone, role } = body;
        const cleanName = String(name || '').trim();
        const cleanPhone = String(phone || '').trim();

        if (!cleanName || !cleanPhone || !['customer', 'transporter'].includes(role)) {
          sendJson(res, 400, { error: 'name, phone and valid role are required' });
          return;
        }

        const token = randomUUID();
        const user = {
          id: randomUUID(),
          name: cleanName,
          phone: cleanPhone,
          role,
          token,
        };

        usersByToken.set(token, user);
        sendJson(res, 201, {
          token,
          user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
        });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === '/api/requests' && req.method === 'POST') {
      const user = getUserFromReq(req);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (user.role !== 'customer') {
        sendJson(res, 403, { error: 'Only customers can create requests' });
        return;
      }

      try {
        const body = await parseBody(req);
        const { from, to, amount } = body;
        const cleanFrom = String(from || '').trim();
        const cleanTo = String(to || '').trim();

        if (!cleanFrom || !cleanTo || amount === undefined || amount === null || Number(amount) <= 0) {
          sendJson(res, 400, { error: 'from, to and positive amount are required' });
          return;
        }

        const item = {
          id: randomUUID(),
          customerId: user.id,
          customer: { id: user.id, name: user.name, phone: user.phone },
          transporterId: null,
          transporter: null,
          from: cleanFrom,
          to: cleanTo,
          amount: Number(amount),
          status: 'open',
          createdAt: new Date().toISOString(),
          assignedAt: null,
          messages: [],
        };

        requests.push(item);
        sendJson(res, 201, { request: summarizeOpenRequest(item) });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (url.pathname === '/api/requests/open' && req.method === 'GET') {
      const user = getUserFromReq(req);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (user.role !== 'transporter') {
        sendJson(res, 403, { error: 'Only transporters can view open requests' });
        return;
      }

      const open = requests.filter((item) => item.status === 'open').map(summarizeOpenRequest);
      sendJson(res, 200, { requests: open });
      return;
    }

    if (url.pathname.startsWith('/api/requests/') && url.pathname.endsWith('/accept') && req.method === 'POST') {
      const user = getUserFromReq(req);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (user.role !== 'transporter') {
        sendJson(res, 403, { error: 'Only transporters can accept requests' });
        return;
      }

      const id = url.pathname.split('/')[3];
      const item = getRequestById(id);

      if (!item) {
        sendJson(res, 404, { error: 'Request not found' });
        return;
      }
      if (item.status !== 'open') {
        sendJson(res, 409, { error: 'Request already accepted' });
        return;
      }

      item.status = 'assigned';
      item.transporterId = user.id;
      item.transporter = { id: user.id, name: user.name, phone: user.phone };
      item.assignedAt = new Date().toISOString();

      sendJson(res, 200, {
        message: 'Request accepted',
        request: summarizeAssignedRequest(item, user),
      });
      return;
    }

    if (url.pathname === '/api/my-task' && req.method === 'GET') {
      const user = getUserFromReq(req);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const mine = requests.find(
        (item) =>
          item.status === 'assigned' && (item.customerId === user.id || item.transporterId === user.id)
      );

      if (!mine) {
        sendJson(res, 200, { task: null });
        return;
      }

      sendJson(res, 200, { task: summarizeAssignedRequest(mine, user) });
      return;
    }

    if (url.pathname.startsWith('/api/my-task/') && url.pathname.endsWith('/message') && req.method === 'POST') {
      const user = getUserFromReq(req);
      if (!user) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }

      const id = url.pathname.split('/')[3];
      const item = getRequestById(id);

      if (!item || item.status !== 'assigned') {
        sendJson(res, 404, { error: 'Assigned task not found' });
        return;
      }

      const isParticipant = item.customerId === user.id || item.transporterId === user.id;
      if (!isParticipant) {
        sendJson(res, 403, { error: 'Not part of this task' });
        return;
      }

      try {
        const body = await parseBody(req);
        const text = String(body.text || '').trim();
        if (!text) {
          sendJson(res, 400, { error: 'Message text is required' });
          return;
        }

        item.messages.push({
          id: randomUUID(),
          senderRole: item.customerId === user.id ? 'customer' : 'transporter',
          text,
          sentAt: new Date().toISOString(),
        });

        sendJson(res, 201, { ok: true });
      } catch (error) {
        sendJson(res, 400, { error: error.message });
      }
      return;
    }

    if (req.method === 'GET') {
      const relativePath = url.pathname === '/' ? '/index.html' : url.pathname;
      const filePath = path.join(PUBLIC_DIR, relativePath);

      if (!filePath.startsWith(PUBLIC_DIR)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath);
        const contentType =
          ext === '.html'
            ? 'text/html'
            : ext === '.css'
            ? 'text/css'
            : ext === '.js'
            ? 'application/javascript'
            : 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });
}

const server = createServer();

function startServer(port = PORT, host = HOST) {
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      // eslint-disable-next-line no-console
      const address = server.address();
      const activePort = typeof address === 'object' && address ? address.port : port;
      console.log(`Student Delivery Network running at http://${host}:${activePort}`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { server, startServer };
