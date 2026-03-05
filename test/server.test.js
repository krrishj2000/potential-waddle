const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, server } = require('../server');

let baseUrl;

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json();
  return { response, payload };
}

test.before(async () => {
  await startServer(0, '127.0.0.1');
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
});

test('full flow: anonymous request, first accept wins, private chat', async () => {
  const customerSignUp = await api('/api/signup', {
    method: 'POST',
    body: { name: 'Asha', phone: '111111', role: 'customer' },
  });
  assert.equal(customerSignUp.response.status, 201);

  const transporterOneSignUp = await api('/api/signup', {
    method: 'POST',
    body: { name: 'Ravi', phone: '222222', role: 'transporter' },
  });
  assert.equal(transporterOneSignUp.response.status, 201);

  const transporterTwoSignUp = await api('/api/signup', {
    method: 'POST',
    body: { name: 'Neha', phone: '333333', role: 'transporter' },
  });
  assert.equal(transporterTwoSignUp.response.status, 201);

  const customerToken = customerSignUp.payload.token;
  const transporterOneToken = transporterOneSignUp.payload.token;
  const transporterTwoToken = transporterTwoSignUp.payload.token;

  const posted = await api('/api/requests', {
    method: 'POST',
    token: customerToken,
    body: { from: 'Hostel A', to: 'Library', amount: 150 },
  });
  assert.equal(posted.response.status, 201);
  const requestId = posted.payload.request.id;

  const openBeforeAccept = await api('/api/requests/open', { token: transporterOneToken });
  assert.equal(openBeforeAccept.response.status, 200);
  assert.equal(openBeforeAccept.payload.requests.length, 1);
  assert.equal(openBeforeAccept.payload.requests[0].from, 'Hostel A');
  assert.equal(openBeforeAccept.payload.requests[0].to, 'Library');
  assert.equal(openBeforeAccept.payload.requests[0].amount, 150);
  assert.equal(openBeforeAccept.payload.requests[0].customer, undefined);

  const firstAccept = await api(`/api/requests/${requestId}/accept`, {
    method: 'POST',
    token: transporterOneToken,
  });
  assert.equal(firstAccept.response.status, 200);

  const secondAccept = await api(`/api/requests/${requestId}/accept`, {
    method: 'POST',
    token: transporterTwoToken,
  });
  assert.equal(secondAccept.response.status, 409);

  const customerTask = await api('/api/my-task', { token: customerToken });
  assert.equal(customerTask.response.status, 200);
  assert.equal(customerTask.payload.task.counterparty.displayName, 'Ravi');
  assert.equal(customerTask.payload.task.counterparty.phone, '222222');

  const messageSend = await api(`/api/my-task/${requestId}/message`, {
    method: 'POST',
    token: customerToken,
    body: { text: 'Please pick up at 6 PM' },
  });
  assert.equal(messageSend.response.status, 201);

  const transporterTask = await api('/api/my-task', { token: transporterOneToken });
  assert.equal(transporterTask.response.status, 200);
  assert.equal(transporterTask.payload.task.messages.length, 1);
  assert.equal(transporterTask.payload.task.messages[0].text, 'Please pick up at 6 PM');
});
