# Student Delivery Network

A minimal local intranet MVP where:

- Users sign up as either a **customer** or **transporter**.
- Customers post delivery requests with `from`, `to`, and `amount`.
- Transporters see those requests anonymously and the **first one to accept** gets assigned.
- Once assigned, contact details are revealed only to those two users.
- The pair can chat in a private task chat.

## Run on your laptop

```bash
npm start
```

The app binds to `0.0.0.0` by default, so people on your local network can open:

- `http://localhost:3000` (your own laptop)
- `http://<your-laptop-local-ip>:3000` (other devices on the same network)

If needed, you can override host/port:

```bash
HOST=0.0.0.0 PORT=3000 npm start
```

## Testing

```bash
npm test
```

## Notes

- Data is stored **in memory** (for demo purposes).
- If the server restarts, users/requests/messages are reset.
