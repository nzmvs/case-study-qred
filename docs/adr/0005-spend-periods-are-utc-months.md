# Spend periods are UTC calendar months

A Card's Spend period is the calendar month in UTC, not in the Company's local time zone. The Card API must enforce the Spending limit when the Card processor records a Transaction, a request that carries no Company context, and a local month would force the Card API to hold or fetch Company time zones owned by the Identity API. We accept that a purchase made in the first hour or two of a local month counts towards the previous one; the Screen and the limit check use the same UTC month, so they never disagree.

## Considered Options

- A time zone on each Card: duplicates Company data onto every Card, and the copies drift.
- A local copy of Company time zones fed by Identity events: correct, but needs the event pipeline this case defers.
- A synchronous lookup against the Identity API: breaks the Card API's rule of no runtime dependencies on its busiest path.
