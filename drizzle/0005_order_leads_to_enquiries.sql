-- New cars are gone (#168): a factory order request already in the dashboard becomes a car enquiry, and its bell notice reads as one,
-- so nothing a buyer sent is lost and no page meets a kind it no longer knows. Its words (the car asked for) stay in the message.
UPDATE `admin_docs` SET `data` = json_set(`data`, '$.type', 'enquiry') WHERE `collection` = 'leads' AND json_extract(`data`, '$.type') = 'order';
--> statement-breakpoint
UPDATE `admin_docs` SET `data` = json_set(`data`, '$.kind', 'lead', '$.text', 'Car enquiry') WHERE `collection` = 'notifications' AND json_extract(`data`, '$.kind') = 'order';
