import { Router, Request, Response } from 'express';
import { runQuery, runQuerySingle } from './database';

const router = Router();

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Track Hub API is running' });
});

// Get top performances with pagination
router.get('/performances', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const event = req.query.event as string;
    const gender = req.query.gender as string;

    let query = `
      SELECT
        r.result_id,
        a.athlete_id,
        a.full_name,
        a.gender,
        r.event_name,
        r.mark_raw,
        r.mark_seconds,
        r.date,
        r.meet_name,
        r.meet_location,
        r.place,
        r.round,
        s.official_name as school_name,
        s.division,
        s.state
      FROM results r
      JOIN athletes a ON r.athlete_id = a.athlete_id
      LEFT JOIN teams t ON r.team_id = t.team_id
      LEFT JOIN schools s ON t.school_id = s.school_id
      WHERE r.date >= '2024-01-01'
    `;

    const params: any[] = [];

    if (event) {
      query += ` AND r.event_name = ?`;
      params.push(event);
    }

    if (gender) {
      query += ` AND a.gender = ?`;
      params.push(gender);
    }

    query += ` ORDER BY r.date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await runQuery(query, params);

    res.json({
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('Error fetching performances:', error);
    res.status(500).json({ error: 'Failed to fetch performances' });
  }
});

// Get NCAA Championship performances (for homepage)
router.get('/performances/ncaa', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const query = `
      SELECT
        r.result_id,
        a.athlete_id,
        a.full_name,
        a.gender,
        r.event_name,
        r.mark_raw,
        r.date,
        r.meet_name,
        r.place,
        s.official_name as school_name,
        s.division
      FROM results r
      JOIN athletes a ON r.athlete_id = a.athlete_id
      LEFT JOIN teams t ON r.team_id = t.team_id
      LEFT JOIN schools s ON t.school_id = s.school_id
      WHERE r.date >= '2024-01-01'
        AND r.place <= 3
        AND r.meet_name LIKE '%NCAA%'
      ORDER BY r.date DESC
      LIMIT ?
    `;

    const results = await runQuery(query, [limit]);

    res.json({
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching NCAA performances:', error);
    res.status(500).json({ error: 'Failed to fetch NCAA performances' });
  }
});

// Search athletes
router.get('/athletes/search', async (req: Request, res: Response) => {
  try {
    const searchTerm = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const query = `
      SELECT
        a.athlete_id,
        a.full_name,
        a.gender,
        a.class_year,
        a.primary_events,
        a.hometown,
        s.official_name as school_name,
        s.division,
        s.state
      FROM athletes a
      LEFT JOIN schools s ON a.school_id = s.school_id
      WHERE a.full_name LIKE ?
        AND a.is_active = 1
      ORDER BY a.full_name
      LIMIT ?
    `;

    const results = await runQuery(query, [`%${searchTerm}%`, limit]);

    res.json({
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching athletes:', error);
    res.status(500).json({ error: 'Failed to search athletes' });
  }
});

// Get athlete details
router.get('/athletes/:id', async (req: Request, res: Response) => {
  try {
    const athleteId = parseInt(req.params.id);

    const query = `
      SELECT
        a.*,
        s.official_name as school_name,
        s.short_name,
        s.division,
        s.city,
        s.state
      FROM athletes a
      LEFT JOIN schools s ON a.school_id = s.school_id
      WHERE a.athlete_id = ?
    `;

    const athlete = await runQuerySingle(query, [athleteId]);

    if (!athlete) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    res.json(athlete);
  } catch (error) {
    console.error('Error fetching athlete:', error);
    res.status(500).json({ error: 'Failed to fetch athlete details' });
  }
});

// Get athlete's performances
router.get('/athletes/:id/performances', async (req: Request, res: Response) => {
  try {
    const athleteId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit as string) || 20;

    const query = `
      SELECT
        r.*,
        s.official_name as school_name
      FROM results r
      LEFT JOIN teams t ON r.team_id = t.team_id
      LEFT JOIN schools s ON t.school_id = s.school_id
      WHERE r.athlete_id = ?
      ORDER BY r.date DESC
      LIMIT ?
    `;

    const results = await runQuery(query, [athleteId, limit]);

    res.json({
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error fetching athlete performances:', error);
    res.status(500).json({ error: 'Failed to fetch athlete performances' });
  }
});

// Get all athletes with pagination
router.get('/athletes', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const gender = req.query.gender as string;
    const division = req.query.division as string;

    let query = `
      SELECT
        a.athlete_id,
        a.full_name,
        a.first_name,
        a.last_name,
        a.gender,
        a.class_year,
        a.grad_year,
        a.primary_events,
        a.hometown,
        a.high_school,
        s.official_name as school_name,
        s.division,
        s.city,
        s.state
      FROM athletes a
      LEFT JOIN schools s ON a.school_id = s.school_id
      WHERE a.is_active = 1
    `;

    const params: any[] = [];

    if (gender) {
      query += ` AND a.gender = ?`;
      params.push(gender);
    }

    if (division) {
      query += ` AND s.division = ?`;
      params.push(division);
    }

    query += ` ORDER BY a.full_name LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await runQuery(query, params);

    res.json({
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('Error fetching athletes:', error);
    res.status(500).json({ error: 'Failed to fetch athletes' });
  }
});

// Get all schools with pagination
router.get('/schools', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const division = req.query.division as string;

    let query = `
      SELECT
        s.school_id,
        s.official_name,
        s.short_name,
        s.city,
        s.state,
        s.division,
        r.region_name,
        c.name as conference_name
      FROM schools s
      LEFT JOIN regions r ON s.region_id = r.region_id
      LEFT JOIN conferences c ON s.current_conference_id = c.conference_id
      WHERE s.is_active = 1
    `;

    const params: any[] = [];

    if (division) {
      query += ` AND s.division = ?`;
      params.push(division);
    }

    query += ` ORDER BY s.official_name LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await runQuery(query, params);

    res.json({
      data: results,
      pagination: {
        limit,
        offset,
        count: results.length,
      },
    });
  } catch (error) {
    console.error('Error fetching schools:', error);
    res.status(500).json({ error: 'Failed to fetch schools' });
  }
});

// Search schools
router.get('/schools/search', async (req: Request, res: Response) => {
  try {
    const searchTerm = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;

    if (!searchTerm || searchTerm.length < 2) {
      return res.status(400).json({ error: 'Search term must be at least 2 characters' });
    }

    const query = `
      SELECT
        s.school_id,
        s.official_name,
        s.short_name,
        s.city,
        s.state,
        s.division,
        r.region_name,
        c.name as conference_name
      FROM schools s
      LEFT JOIN regions r ON s.region_id = r.region_id
      LEFT JOIN conferences c ON s.current_conference_id = c.conference_id
      WHERE (s.official_name LIKE ? OR s.short_name LIKE ?)
        AND s.is_active = 1
      ORDER BY s.official_name
      LIMIT ?
    `;

    const results = await runQuery(query, [`%${searchTerm}%`, `%${searchTerm}%`, limit]);

    res.json({
      data: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Error searching schools:', error);
    res.status(500).json({ error: 'Failed to search schools' });
  }
});

// Get school details
router.get('/schools/:id', async (req: Request, res: Response) => {
  try {
    const schoolId = parseInt(req.params.id);

    const query = `
      SELECT
        s.*,
        r.region_name,
        c.name as conference_name,
        c.abbreviation as conference_abbrev
      FROM schools s
      LEFT JOIN regions r ON s.region_id = r.region_id
      LEFT JOIN conferences c ON s.current_conference_id = c.conference_id
      WHERE s.school_id = ?
    `;

    const school = await runQuerySingle(query, [schoolId]);

    if (!school) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(school);
  } catch (error) {
    console.error('Error fetching school:', error);
    res.status(500).json({ error: 'Failed to fetch school details' });
  }
});

// Get available events
router.get('/events', async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT DISTINCT event_name
      FROM results
      ORDER BY event_name
    `;

    const results = await runQuery<{ event_name: string }>(query);
    const events = results.map(r => r.event_name);

    res.json({
      data: events,
      count: events.length,
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

export default router;
