const state = {
  token: null,
  user: null,
  task: null,
};

const authCard = document.getElementById('auth-card');
const customerCard = document.getElementById('customer-card');
const transporterCard = document.getElementById('transporter-card');
const taskCard = document.getElementById('task-card');
const statusEl = document.getElementById('status');
const openRequestsEl = document.getElementById('open-requests');
const taskInfoEl = document.getElementById('task-info');
const messagesEl = document.getElementById('messages');

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? '#b91c1c' : '#065f46';
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const res = await fetch(path, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

function render() {
  authCard.classList.toggle('hidden', Boolean(state.user));
  customerCard.classList.toggle('hidden', state.user?.role !== 'customer');
  transporterCard.classList.toggle('hidden', state.user?.role !== 'transporter');
  taskCard.classList.toggle('hidden', !state.task);

  if (state.task) {
    taskInfoEl.innerHTML = `
      <p><strong>From:</strong> ${state.task.from}</p>
      <p><strong>To:</strong> ${state.task.to}</p>
      <p><strong>Amount:</strong> ${state.task.amount}</p>
      <p><strong>Contact name:</strong> ${state.task.counterparty.displayName}</p>
      <p><strong>Contact phone:</strong> ${state.task.counterparty.phone}</p>
    `;

    messagesEl.innerHTML = '';
    for (const msg of state.task.messages) {
      const div = document.createElement('div');
      div.className = 'message';
      div.textContent = `[${msg.senderRole}] ${msg.text}`;
      messagesEl.appendChild(div);
    }
  }
}

async function pollOpenRequests() {
  if (state.user?.role !== 'transporter') return;

  try {
    const data = await api('/api/requests/open');
    openRequestsEl.innerHTML = '';

    if (data.requests.length === 0) {
      openRequestsEl.textContent = 'No open requests right now.';
      return;
    }

    for (const req of data.requests) {
      const item = document.createElement('div');
      item.className = 'open-request';
      item.innerHTML = `
        <p><strong>From:</strong> ${req.from}</p>
        <p><strong>To:</strong> ${req.to}</p>
        <p><strong>Amount:</strong> ${req.amount}</p>
      `;

      const button = document.createElement('button');
      button.textContent = 'Accept (first come first served)';
      button.addEventListener('click', async () => {
        try {
          await api(`/api/requests/${req.id}/accept`, { method: 'POST' });
          setStatus('You accepted the request. Contact details are now shared privately.');
          await pollTask();
          await pollOpenRequests();
        } catch (error) {
          setStatus(error.message, true);
          await pollOpenRequests();
        }
      });

      item.appendChild(button);
      openRequestsEl.appendChild(item);
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function pollTask() {
  if (!state.user) return;

  try {
    const data = await api('/api/my-task');
    state.task = data.task;
    render();
  } catch (error) {
    setStatus(error.message, true);
  }
}

document.getElementById('signup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    const data = await api('/api/signup', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        phone: formData.get('phone'),
        role: formData.get('role'),
      }),
    });

    state.token = data.token;
    state.user = data.user;
    setStatus(`Signed in as ${state.user.role}`);
    render();
    await pollTask();
    await pollOpenRequests();
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('request-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);

  try {
    await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify({
        from: formData.get('from'),
        to: formData.get('to'),
        amount: Number(formData.get('amount')),
      }),
    });

    event.target.reset();
    setStatus('Request posted anonymously to all transporters.');
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById('chat-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.task) return;

  const formData = new FormData(event.target);

  try {
    await api(`/api/my-task/${state.task.id}/message`, {
      method: 'POST',
      body: JSON.stringify({ text: formData.get('message') }),
    });

    event.target.reset();
    await pollTask();
  } catch (error) {
    setStatus(error.message, true);
  }
});

setInterval(async () => {
  await pollTask();
  await pollOpenRequests();
}, 2000);

render();
