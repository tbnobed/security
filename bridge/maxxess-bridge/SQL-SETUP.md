# Read-only SQL access for the FrontDesk bridge

Goal: a SQL Server login named `frontdesk_reader` that can ONLY read the
eFusion database, reachable from the machine that runs the bridge.

Do all of this on the eFusion server (the machine running the
`CONTEGO3\MAXXESS` SQL instance). You need SQL Server Management Studio
(SSMS) and the `sa` password (the eFusion install uses `sa`).

## Step 1 — Enable TCP/IP on the MAXXESS instance

In **SQL Server Configuration Manager**:

1. Expand **SQL Server Network Configuration → Protocols for MAXXESS**.
2. If **TCP/IP** is `Disabled`, right-click → **Enable**.
3. Optional but recommended: right-click TCP/IP → **Properties → IP Addresses**
   tab → scroll to **IPAll** → clear *TCP Dynamic Ports* and set
   **TCP Port = 1433** (a fixed port makes the firewall rule and connection
   string simpler).
4. Restart the **SQL Server (MAXXESS)** service (SQL Server Services →
   right-click → Restart). Do this out of hours — eFusion talks to this
   database, and the restart drops its connections for a few seconds.

Note: **SQL Server Browser** is already Running (good). If you did NOT pin
port 1433, the Browser service is required so clients can find the named
instance (UDP 1434).

## Step 2 — Confirm Mixed Mode authentication

In SSMS, connect to `localhost\MAXXESS`, right-click the server →
**Properties → Security**. "SQL Server and Windows Authentication mode" must
be selected (it almost certainly already is — eFusion itself logs in as `sa`).
If you have to change it, restart the MAXXESS service afterwards.

## Step 3 — Find the eFusion database name

In SSMS Object Explorer expand **Databases**, or run:

```sql
SELECT name FROM sys.databases WHERE database_id > 4;
```

(`database_id > 4` hides the system databases.) The eFusion database is
named `AXxess` on this install. Note the exact name.

## Step 4 — Create the read-only login

In SSMS, open a New Query window and run (replace the database name and pick
a strong password):

```sql
USE [master];
CREATE LOGIN frontdesk_reader
  WITH PASSWORD = 'PUT-A-STRONG-PASSWORD-HERE',
  CHECK_POLICY = ON,
  DEFAULT_DATABASE = [AXxess];

USE [AXxess];  -- exact eFusion database name from Step 3
CREATE USER frontdesk_reader FOR LOGIN frontdesk_reader;
ALTER ROLE db_datareader ADD MEMBER frontdesk_reader;
```

`db_datareader` = SELECT on every table, nothing else. The login cannot
change data, cannot see other databases, cannot administer the server.

## Step 5 — Open the firewall (narrowly)

In Windows Defender Firewall → Advanced Settings → Inbound Rules, add:

- Allow **TCP 1433** (or your chosen port) — scope it to the IP address of
  the bridge machine only (Rule → Scope → Remote IP addresses).
- If you did not pin a fixed port in Step 1: also allow **UDP 1434**
  (SQL Server Browser), same scope.

Never expose these ports beyond the LAN.

## Step 6 — Test from the bridge machine

From the machine that will run the bridge:

```
sqlcmd -S CONTEGO3\MAXXESS -U frontdesk_reader -P '...' -d AXxess -Q "SELECT TOP 5 name FROM sys.tables ORDER BY name"
```

(or with a pinned port: `-S CONTEGO3,1433`). If you get five table names
back, access works. If it can't connect: re-check Step 1 (TCP enabled +
service restarted) and Step 5 (firewall scope).

## Step 7 — Discovery queries for the adapter

Run these as `frontdesk_reader` and send the output to whoever is wiring up
the bridge adapter — they identify the transaction-log and cardholder tables:

```sql
-- all tables
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME;

-- columns of the likely event/transaction tables
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME LIKE '%trans%' OR TABLE_NAME LIKE '%event%'
   OR TABLE_NAME LIKE '%card%'  OR TABLE_NAME LIKE '%area%'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```

## What the bridge needs at the end

Four values, set in the bridge's `.env`:

- server + instance/port (e.g. `CONTEGO3\MAXXESS` or `CONTEGO3,1433`)
- database name: `AXxess`
- login: `frontdesk_reader`
- its password
