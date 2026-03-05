# Student Delivery Network

A minimal MVP app where:

- Users sign up as either a **customer** or **transporter**.
- Customers post delivery requests with `from`, `to`, and `amount`.
- Transporters see those requests anonymously and the **first one to accept** gets assigned.
- Once assigned, contact details are revealed only to those two users.
- The pair can chat in a private task chat.

## Run

```bash
npm start
```

Then open `http://localhost:3000`.

## Notes

- Data is stored **in memory** (for demo purposes).
- If the server restarts, users/requests/messages are reset.
