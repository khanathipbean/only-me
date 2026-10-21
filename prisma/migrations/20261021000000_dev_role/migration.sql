-- A role for the person who fixes what a tester found.
--
-- Reads what a VIEWER reads and writes one thing: the work state of a case
-- handed to them. Deliberately left out of `EDITOR_ROLES` in the application,
-- which is what makes every existing write refuse it without being changed.
--
-- Adds a value to an enum. No row is read, written or moved; nobody holds this
-- role until somebody is given it.
ALTER TYPE "ProjectRole" ADD VALUE 'DEV';
