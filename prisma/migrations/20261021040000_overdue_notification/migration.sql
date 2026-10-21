-- Telling somebody a repair has gone past its deadline.
--
-- Its own value rather than reusing ASSIGNED: the check for "has this
-- deadline already been reported" is a query against these rows, and it can
-- only be asked if the two kinds of news are told apart.
--
-- Adds a value to an enum. No row is read, written or moved.
ALTER TYPE "NotificationType" ADD VALUE 'OVERDUE';
