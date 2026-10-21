-- Telling one person a case is now theirs.
--
-- Every other notification type is fanned out to a whole project; this one is
-- addressed to the person it was handed to, which is why `notifyUser` exists
-- beside `notifyProject` rather than a flag being added to the latter.
--
-- Adds a value to an enum. No row is read, written or moved.
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNED';
