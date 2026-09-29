# Split the Card API from the App BFF

The card domain (Cards, Transactions and their lifecycles) lives in the Card API, which depends on no other service at runtime. Users, Companies and Memberships live in the Identity API, and Invoices in the Billing API. Screen-shaped payloads for the mobile app live in the App BFF, which composes calls to the domain services and holds no domain rules. We accept extra network hops and more contracts so that use-case concerns never leak into the domain, and so frontend and domain work can progress in parallel against separate contracts.
