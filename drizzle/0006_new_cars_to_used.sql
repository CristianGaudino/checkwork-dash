-- New vehicles are gone (#188): the dealer sells used stock only. A car stored as new becomes used (no condition, as every used car),
-- so no page, form or website meets a kind it no longer knows. updated_at moves on, as for any change to a car (updateCar).
UPDATE `cars` SET `data` = json_remove(`data`, '$.condition'), `updated_at` = `updated_at` + 1 WHERE json_extract(`data`, '$.condition') = 'new';
