"""
database.py — Crestle
═════════════════════
Database access layer. All SQL lives here.

The rest of the app (server.py) calls these functions
and never writes SQL directly — this keeps concerns
separated and makes a future migration to PostgreSQL
straightforward: only this file needs to change.
"""

import sqlite3
import os

# Path to the database file, relative to this script's location
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crestle.db')


def get_connection():
    """
    Opens and returns a connection to the SQLite database.

    row_factory = sqlite3.Row makes rows behave like dicts,
    so we can access columns by name (row['name']) instead
    of by index (row[1]).

    Returns:
        sqlite3.Connection
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_all_teams():
    """
    Returns all teams in the database as a list of dicts.

    Each dict contains only the fields the frontend needs:
        id, api_id, name, country, league, colour1, colour2, crest_file

    Returns:
        List of dicts, one per team.
    """
    conn = get_connection()

    try:
        rows = conn.execute("""
            SELECT id, api_id, name, country, league, colour1, colour2, crest_file
            FROM teams
            ORDER BY league, name
        """).fetchall()

        # Convert Row objects to plain dicts for JSON serialisation
        return [dict(row) for row in rows]

    finally:
        # Always close the connection, even if an exception occurs
        conn.close()


def get_random_team():
    """
    Returns a single random team as a dict.

    SQLite's RANDOM() function is efficient for this — it doesn't
    load all rows into memory, it just picks one at random.

    Returns:
        Dict with team data, or None if the table is empty.
    """
    conn = get_connection()

    try:
        row = conn.execute("""
            SELECT id, api_id, name, country, league, colour1, colour2, crest_file
            FROM teams
            ORDER BY RANDOM()
            LIMIT 1
        """).fetchone()

        return dict(row) if row else None

    finally:
        conn.close()