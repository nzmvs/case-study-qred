-- Dev-only credentials. One database and one owner per service; no role can reach another service's database.
CREATE ROLE identity LOGIN PASSWORD 'identity';
CREATE ROLE card     LOGIN PASSWORD 'card';
CREATE ROLE billing  LOGIN PASSWORD 'billing';
CREATE ROLE unleash  LOGIN PASSWORD 'unleash';

CREATE DATABASE identity OWNER identity;
CREATE DATABASE card     OWNER card;
CREATE DATABASE billing  OWNER billing;
CREATE DATABASE unleash  OWNER unleash;

REVOKE ALL ON DATABASE identity FROM PUBLIC;
REVOKE ALL ON DATABASE card     FROM PUBLIC;
REVOKE ALL ON DATABASE billing  FROM PUBLIC;
REVOKE ALL ON DATABASE unleash  FROM PUBLIC;
