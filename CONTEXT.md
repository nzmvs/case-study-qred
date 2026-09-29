# Qred Card

Business cards that Qred issues to people acting on behalf of a company, and what those cards may spend.

## Language

### Parties

**User**:
A person who logs in to the Qred app.
_Avoid_: Customer, account, login

**Company**:
A business that holds a relationship with Qred and on whose behalf cards are issued.
_Avoid_: Customer, organisation, account

**Membership**:
The link between a User and a Company that allows the User to act for that Company.
_Avoid_: Access, association, role

**Cardholder**:
The User to whom a Card is issued within a Company.
_Avoid_: Owner, card user

### System

**Identity API**:
The service that owns Users, Companies and Memberships, and vouches for them to the other services.
_Avoid_: Auth service, party, customer, account

**Card API**:
The service that owns Cards and Transactions and their lifecycles. It depends on no other service.
_Avoid_: Resource server, core, backend

**Billing API**:
The service that owns what a Company owes Qred.
_Avoid_: Invoice service, payments, finance

**App BFF**:
The service that shapes data from the Identity, Card and Billing APIs into Screens for the mobile app. It holds no domain rules.
_Avoid_: View server, gateway, frontend API

**Screen**:
One view in the mobile app and the single payload the App BFF serves for it.
_Avoid_: Page, view model, dashboard

### Cards

**Card**:
A payment card issued to one Cardholder under one Company. A Cardholder has at most one Card in a Company that is neither closed nor expired.
_Avoid_: Account, credit card

**Card status**:
Where a Card is in its lifecycle: inactive (issued, not yet usable), active, frozen (temporarily blocked by the Cardholder), closed (permanently ended by a decision), or expired (permanently ended by passing its expiry date).
_Avoid_: State, card state, blocked, cancelled

**Closed reason**:
Why a Card was closed: lost, stolen, or cancelled. Expiry is not a Closed reason; it is its own Card status.
_Avoid_: Termination reason, block reason

**Replacement**:
A new Card issued to the same Cardholder in the same Company after their previous Card was closed or expired.
_Avoid_: Reissue, renewal

**Transaction**:
A single purchase or charge made with a Card. It is pending until the card network confirms it (settled) or cancels it (reversed).
_Avoid_: Payment, purchase, charge, authorisation

**Card processor**:
The external party that authorises Card purchases and reports them as Transactions.
_Avoid_: Acquirer, network, PSP

### Spend

**Spending limit**:
The maximum a single Card may spend in one Spend period.
_Avoid_: Card limit, budget, credit limit, set limit

**Spend period**:
The calendar month, in the Company's time zone, over which a Card's spend is measured against its Spending limit.
_Avoid_: Cycle, window

**Remaining spend**:
The Spending limit minus the sum of pending and settled Transactions on a Card in the current Spend period, never below zero.
_Avoid_: Balance, available funds

### Billing

**Invoice**:
A demand for payment that Qred sends to a Company, with an amount and a due date.
_Avoid_: Bill, statement, payment request
