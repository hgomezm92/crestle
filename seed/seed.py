"""
seed.py — Crestle
═════════════════
Data extraction script. Populates the database with teams
and downloads their crest images.

Source: TheSportsDB (thesportsdb.com)
  - Free tier: up to 10 teams per league endpoint
  - No API key required beyond the public key "123"
  - Returns team name, country, league, badge URL and colours

NOT part of the production app. Run manually when you want
to refresh or expand the dataset.

Usage:
    python seed.py

Output:
    - backend/crestle.db  → SQLite database with team records
    - backend/crests/     → PNG crest images named by team ID
"""

import os
import time
import sqlite3
import requests


# ════════════════════════════════════════════════════════════════
# 1. CONFIGURATION
# ════════════════════════════════════════════════════════════════

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(BASE_DIR, '..', 'backend', 'crestle.db')
CRESTS_DIR = os.path.join(BASE_DIR, '..', 'backend', 'crests')

# TheSportsDB public API — free tier key is literally "123"
SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/123'

HEADERS = {'User-Agent': 'crestle/1.0'}

# Leagues to fetch. These are the exact names TheSportsDB expects.
# Free tier returns up to 10 teams per league.
LEAGUES = [
    'Spanish_La_Liga',
    'English_Premier_League',
    'Italian_Serie_A',
    'German_Bundesliga',
    'French_Ligue_1',
    'Dutch_Eredivisie',
    'Portuguese_Primeira_Liga',
]


# ════════════════════════════════════════════════════════════════
# 2. DATABASE SETUP
# ════════════════════════════════════════════════════════════════

def init_db(conn):
    """
    Creates the teams table if it doesn't already exist.

    We use IF NOT EXISTS so the script is safe to re-run —
    it won't wipe existing data unless you explicitly drop the table.

    Columns:
        id          INTEGER  primary key, auto-incremented by SQLite
        api_id      TEXT     TheSportsDB team ID (unique, used as crest filename)
        name        TEXT     team display name
        country     TEXT     country name
        league      TEXT     league name
        colour1     TEXT     primary colour hex (e.g. "#EF0107")
        colour2     TEXT     secondary colour hex
        crest_file  TEXT     filename of the downloaded crest PNG

    Args:
        conn: active sqlite3 connection
    """
    conn.execute("""
        CREATE TABLE IF NOT EXISTS teams (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            api_id     TEXT    UNIQUE NOT NULL,
            name       TEXT    NOT NULL,
            country    TEXT    NOT NULL,
            league     TEXT    NOT NULL,
            colour1    TEXT,
            colour2    TEXT,
            crest_file TEXT
        )
    """)
    conn.commit()


# ════════════════════════════════════════════════════════════════
# 3. FETCHING TEAMS FROM THESPORTSDB
# ════════════════════════════════════════════════════════════════

def fetch_teams_for_league(league_name):
    """
    Calls the TheSportsDB search_all_teams endpoint for a league
    and returns a list of normalised team dicts.

    The raw API response includes many fields we don't need.
    We extract only what the game uses:
        api_id, name, country, league, colour1, colour2, badge_url

    Args:
        league_name: league string as TheSportsDB expects it
                     (e.g. 'Spanish_La_Liga')

    Returns:
        List of dicts with keys: api_id, name, country, league,
        colour1, colour2, badge_url.
        Returns empty list on error or if API returns null.
    """
    print(f'  Fetching {league_name}...')

    try:
        response = requests.get(
            f'{SPORTSDB_BASE}/search_all_teams.php',
            params={'l': league_name},
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()

    except requests.exceptions.RequestException as e:
        print(f'  ERROR: {e}')
        return []

    # Free tier may return {"teams": null} for some queries
    raw_teams = response.json().get('teams') or []

    teams = []
    for t in raw_teams:
        # Skip teams without a badge — unusable in the game
        if not t.get('strBadge'):
            continue

        teams.append({
            'api_id':    t['idTeam'],
            'name':      t['strTeam'],
            'country':   t.get('strCountry', ''),
            'league':    league_name.replace('_', ' '),
            'colour1':   t.get('strColour1', ''),
            'colour2':   t.get('strColour2', ''),
            'badge_url': t['strBadge'],
        })

    print(f'  → {len(teams)} teams found')
    return teams


def fetch_all_teams():
    """
    Iterates over all configured leagues and returns a deduplicated
    list of all teams.

    Deduplication is by api_id — a team that appears in multiple
    leagues (e.g. cup competitions) is only included once.

    Returns:
        List of team dicts.
    """
    print('Fetching teams from TheSportsDB...\n')

    all_teams = []
    seen_ids  = set()

    for league_name in LEAGUES:
        teams = fetch_teams_for_league(league_name)

        for team in teams:
            if team['api_id'] not in seen_ids:
                seen_ids.add(team['api_id'])
                all_teams.append(team)

        time.sleep(0.5)  # be polite to the API

    print(f'\nTotal: {len(all_teams)} unique teams\n')
    return all_teams


# ════════════════════════════════════════════════════════════════
# 4. DOWNLOADING CREST IMAGES
# ════════════════════════════════════════════════════════════════

def download_crest(team):
    """
    Downloads the crest image for a team and saves it as a PNG
    in the crests directory.

    File naming: {api_id}.png  (e.g. 133604.png for Arsenal)
    Using the api_id as filename makes lookups trivial — the
    backend just needs the team's api_id to serve the crest.

    If the file already exists it is skipped, so re-running the
    script only downloads new or missing crests.

    Args:
        team: dict with keys api_id and badge_url

    Returns:
        Filename string (e.g. '133604.png') on success, None on failure.
    """
    filename    = f"{team['api_id']}.png"
    output_path = os.path.join(CRESTS_DIR, filename)

    # Skip if already downloaded
    if os.path.exists(output_path):
        return filename

    try:
        response = requests.get(
            team['badge_url'],
            headers=HEADERS,
            timeout=15,
        )
        response.raise_for_status()

        with open(output_path, 'wb') as f:
            f.write(response.content)

        return filename

    except requests.exceptions.RequestException as e:
        print(f'  WARNING: could not download crest for {team["name"]}: {e}')
        return None


# ════════════════════════════════════════════════════════════════
# 5. SAVING TO DATABASE
# ════════════════════════════════════════════════════════════════

def save_team(conn, team, crest_file):
    """
    Inserts a team record into the database.

    Uses INSERT OR IGNORE so that re-running the script doesn't
    raise errors for teams that are already in the database.
    To update existing records you would use INSERT OR REPLACE.

    Args:
        conn:       active sqlite3 connection
        team:       team dict from fetch_all_teams()
        crest_file: filename returned by download_crest(), or None
    """
    conn.execute("""
        INSERT OR IGNORE INTO teams
            (api_id, name, country, league, colour1, colour2, crest_file)
        VALUES
            (:api_id, :name, :country, :league, :colour1, :colour2, :crest_file)
    """, {**team, 'crest_file': crest_file})


# ════════════════════════════════════════════════════════════════
# 6. ENTRY POINT
# ════════════════════════════════════════════════════════════════

if __name__ == '__main__':

    # Ensure the crests directory exists
    os.makedirs(CRESTS_DIR, exist_ok=True)

    # Connect to SQLite — creates the file if it doesn't exist
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)

    teams = fetch_all_teams()

    print('Downloading crests and saving to database...\n')

    for i, team in enumerate(teams, 1):
        crest_file = download_crest(team)
        save_team(conn, team, crest_file)

        status = '✓' if crest_file else '✗'
        print(f'  [{i:02d}/{len(teams)}] {status} {team["name"]}')

        time.sleep(0.3)  # avoid hammering the image CDN

    conn.commit()
    conn.close()

    print(f'\nDone. Database: {DB_PATH}')
    print(f'Crests folder: {CRESTS_DIR}')