import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase() {
  if (db) return db;

  try {
    // Load the database from assets
    const dbAsset = Asset.fromModule(require('../assets/data/track_hub.db'));
    await dbAsset.downloadAsync();

    // Copy to document directory if needed
    const dbName = 'track_hub.db';
    const dbPath = `${FileSystem.documentDirectory}SQLite/${dbName}`;

    // Create SQLite directory if it doesn't exist
    const dirInfo = await FileSystem.getInfoAsync(`${FileSystem.documentDirectory}SQLite`);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(`${FileSystem.documentDirectory}SQLite`, {
        intermediates: true,
      });
    }

    // Check if database already exists
    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (!fileInfo.exists && dbAsset.localUri) {
      await FileSystem.copyAsync({
        from: dbAsset.localUri,
        to: dbPath,
      });
    }

    // Open database
    db = await SQLite.openDatabaseAsync(dbName);
    console.log('Database initialized successfully');
    return db;
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
}

export async function getDatabase() {
  if (!db) {
    await initDatabase();
  }
  return db!;
}

// Get top performances for the home screen
export async function getTopPerformances(limit: number = 10) {
  const database = await getDatabase();

  const query = `
    SELECT
      r.athlete_id,
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

  const result = await database.getAllAsync(query, [limit]);
  return result;
}

// Get performances by event
export async function getPerformancesByEvent(eventName: string, limit: number = 20) {
  const database = await getDatabase();

  const query = `
    SELECT
      a.full_name,
      a.gender,
      r.event_name,
      r.mark_raw,
      r.mark_seconds,
      r.date,
      r.meet_name,
      r.place,
      s.official_name as school_name,
      s.division
    FROM results r
    JOIN athletes a ON r.athlete_id = a.athlete_id
    LEFT JOIN teams t ON r.team_id = t.team_id
    LEFT JOIN schools s ON t.school_id = s.school_id
    WHERE r.event_name = ?
      AND r.date >= '2024-01-01'
    ORDER BY r.mark_seconds ASC
    LIMIT ?
  `;

  const result = await database.getAllAsync(query, [eventName, limit]);
  return result;
}

// Search athletes
export async function searchAthletes(searchTerm: string, limit: number = 20) {
  const database = await getDatabase();

  const query = `
    SELECT
      a.athlete_id,
      a.full_name,
      a.gender,
      a.class_year,
      a.primary_events,
      s.official_name as school_name,
      s.division
    FROM athletes a
    LEFT JOIN schools s ON a.school_id = s.school_id
    WHERE a.full_name LIKE ?
      AND a.is_active = 1
      AND a.full_name IS NOT NULL
      AND a.full_name != ''
      AND a.full_name != ','
    ORDER BY a.full_name
    LIMIT ?
  `;

  const result = await database.getAllAsync(query, [`%${searchTerm}%`, limit]);
  return result;
}

// Search schools
export async function searchSchools(searchTerm: string, limit: number = 20) {
  const database = await getDatabase();

  const query = `
    SELECT
      school_id,
      official_name,
      short_name,
      city,
      state,
      division
    FROM schools
    WHERE (official_name LIKE ? OR short_name LIKE ?)
      AND is_active = 1
    ORDER BY official_name
    LIMIT ?
  `;

  const result = await database.getAllAsync(query, [`%${searchTerm}%`, `%${searchTerm}%`, limit]);
  return result;
}

// Get athlete details
export async function getAthleteDetails(athleteId: number) {
  const database = await getDatabase();

  console.log('getAthleteDetails called with ID:', athleteId, 'type:', typeof athleteId);

  const query = `
    SELECT
      a.*,
      s.official_name as school_name,
      s.division,
      s.city,
      s.state
    FROM athletes a
    LEFT JOIN schools s ON a.school_id = s.school_id
    WHERE a.athlete_id = ?
  `;

  const result = await database.getFirstAsync(query, [athleteId]);
  console.log('Query result:', result);

  // If no result, let's check if any athletes exist
  if (!result) {
    const anyAthlete = await database.getFirstAsync('SELECT * FROM athletes LIMIT 1');
    console.log('Sample athlete from DB:', anyAthlete);
  }

  return result;
}

// Get athlete's recent performances
export async function getAthletePerformances(athleteId: number, limit: number = 20) {
  const database = await getDatabase();

  console.log('getAthletePerformances called with ID:', athleteId);

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

  const result = await database.getAllAsync(query, [athleteId, limit]);
  console.log('Performance results count:', result.length);
  
  if (result.length > 0) {
    console.log('Sample performance fields:', Object.keys(result[0]));
    console.log('Sample performance data:', result[0]);
  }
  
  return result;
}

// Get all athletes with pagination
export async function getAthletes(options: {
  limit?: number;
  offset?: number;
  gender?: string;
  division?: string;
} = {}) {
  const database = await getDatabase();
  const { limit = 50, offset = 0, gender, division } = options;

  let query = `
    SELECT
      a.athlete_id,
      a.full_name,
      a.gender,
      a.class_year,
      a.primary_events,
      s.official_name as school_name,
      s.division,
      s.state
    FROM athletes a
    LEFT JOIN schools s ON a.school_id = s.school_id
    WHERE a.is_active = 1
      AND a.full_name IS NOT NULL
      AND a.full_name != ''
      AND a.full_name != ','
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

  query += `
    ORDER BY a.full_name
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const result = await database.getAllAsync(query, params);
  return {
    data: result,
    pagination: { limit, offset, count: result.length },
  };
}

// Get all schools with pagination
export async function getSchools(options: {
  limit?: number;
  offset?: number;
  division?: string;
} = {}) {
  const database = await getDatabase();
  const { limit = 50, offset = 0, division } = options;

  let query = `
    SELECT
      school_id,
      official_name,
      short_name,
      city,
      state,
      division,
      region_name,
      conference_name,
      conference_abbrev
    FROM schools
    WHERE is_active = 1
  `;

  const params: any[] = [];

  if (division) {
    query += ` AND division = ?`;
    params.push(division);
  }

  query += `
    ORDER BY official_name
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const result = await database.getAllAsync(query, params);
  return {
    data: result,
    pagination: { limit, offset, count: result.length },
  };
}

// Get athlete stats for comparison
export async function getAthleteComparisonStats(athleteId: number) {
  const database = await getDatabase();

  // Get athlete basic info
  const athleteQuery = `
    SELECT
      a.athlete_id,
      a.full_name,
      a.gender,
      s.official_name as school_name,
      s.division
    FROM athletes a
    LEFT JOIN schools s ON a.school_id = s.school_id
    WHERE a.athlete_id = ?
  `;

  const athlete: any = await database.getFirstAsync(athleteQuery, [athleteId]);

  if (!athlete) return null;

  // Get all performances to calculate stats
  const performancesQuery = `
    SELECT
      r.event_name,
      r.mark_raw,
      r.mark_seconds,
      r.date,
      r.place
    FROM results r
    WHERE r.athlete_id = ?
    ORDER BY r.date DESC
  `;

  const performances = await database.getAllAsync(performancesQuery, [athleteId]);

  // Calculate stats per event
  const eventStats: Record<string, any> = {};

  performances.forEach((perf: any) => {
    const eventName = perf.event_name;
    if (!eventStats[eventName]) {
      eventStats[eventName] = {
        personalBest: null,
        seasonBest: null,
        avgTime: 0,
        meets: 0,
        wins: 0,
        times: [],
      };
    }

    const stats = eventStats[eventName];
    const markSeconds = perf.mark_seconds;

    if (markSeconds && markSeconds > 0) {
      stats.times.push(markSeconds);

      // Update personal best (lower is better for track events)
      if (!stats.personalBest || markSeconds < stats.personalBest) {
        stats.personalBest = markSeconds;
        stats.personalBestRaw = perf.mark_raw;
      }

      // Check if this is from current season (2024-2025)
      const perfDate = new Date(perf.date);
      const year = perfDate.getFullYear();
      const month = perfDate.getMonth();
      const seasonStartYear = month >= 8 ? year : year - 1;

      if (seasonStartYear === 2024) {
        if (!stats.seasonBest || markSeconds < stats.seasonBest) {
          stats.seasonBest = markSeconds;
          stats.seasonBestRaw = perf.mark_raw;
        }
      }
    }

    stats.meets++;
    if (perf.place === 1) {
      stats.wins++;
    }
  });

  // Calculate averages
  Object.keys(eventStats).forEach(eventName => {
    const stats = eventStats[eventName];
    if (stats.times.length > 0) {
      const sum = stats.times.reduce((a: number, b: number) => a + b, 0);
      stats.avgTime = sum / stats.times.length;
    }
  });

  return {
    athlete_id: athlete.athlete_id,
    full_name: athlete.full_name,
    gender: athlete.gender,
    school_name: athlete.school_name,
    division: athlete.division,
    eventStats,
  };
}
