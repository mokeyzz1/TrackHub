SELECT setval('athletes_athlete_id_seq', (SELECT MAX(athlete_id) FROM athletes) + 1);
