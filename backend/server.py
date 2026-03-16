"""
server.py — Crestle
════════════════════
Flask API server. Exposes three endpoints:

    GET /api/teams          → all teams as JSON
    GET /api/teams/random   → one random team as JSON
    GET /crests/<filename>  → serves a crest PNG image

The frontend talks only to this server — it never calls
TheSportsDB or any external service directly.

Usage (development):
    python server.py

Usage (production on Render):
    Render will run this via gunicorn automatically.
    See requirements.txt and render.yaml.
"""

import os
from flask import Flask, jsonify, send_from_directory, abort
from flask_cors import CORS
import database

# ════════════════════════════════════════════════════════════════
# 1. APP SETUP
# ════════════════════════════════════════════════════════════════

app = Flask(__name__)

# CORS allows the frontend (on a different origin, e.g. Netlify)
# to call this API. Without this, browsers would block the requests.
# In production you should restrict origins to your actual frontend URL:
#   CORS(app, origins=['https://crestle.netlify.app'])
# For development we allow all origins.
CORS(app)

# Absolute path to the crests folder, relative to this file
CRESTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'crests')


# ════════════════════════════════════════════════════════════════
# 2. ENDPOINTS
# ════════════════════════════════════════════════════════════════

@app.route('/api/teams')
def all_teams():
    """
    Returns all teams in the database as a JSON array.

    The frontend calls this once on page load and stores
    the result locally — no further API calls needed during play.

    Response example:
        [
          {
            "id": 1,
            "api_id": "133604",
            "name": "Arsenal",
            "country": "England",
            "league": "English Premier League",
            "colour1": "#EF0107",
            "colour2": "#fbffff",
            "crest_file": "133604.png"
          },
          ...
        ]
    """
    teams = database.get_all_teams()
    return jsonify(teams)


@app.route('/api/teams/random')
def random_team():
    """
    Returns a single random team as a JSON object.

    Useful for future features (e.g. daily mode where the server
    controls which team is shown). Currently the frontend picks
    randomly from the full list, but this endpoint is here for
    completeness and future use.

    Returns 404 if the database is empty.
    """
    team = database.get_random_team()

    if team is None:
        abort(404, description='No teams found in the database.')

    return jsonify(team)


@app.route('/crests/<filename>')
def serve_crest(filename):
    """
    Serves a crest PNG image from the local crests/ folder.

    Flask's send_from_directory is safe — it prevents directory
    traversal attacks (e.g. requesting '/crests/../server.py')
    by restricting access to the specified directory.

    Args:
        filename: crest filename, e.g. '133604.png'

    Returns 404 if the file doesn't exist.
    """
    return send_from_directory(CRESTS_DIR, filename)


@app.route('/health')
def health():
    """
    Health check endpoint.
    Render and other platforms use this to verify the app is running.
    """
    return jsonify({'status': 'ok'})


# ════════════════════════════════════════════════════════════════
# 3. ENTRY POINT
# ════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    # debug=True auto-reloads the server when you save the file.
    # Never use debug=True in production.
    app.run(port=5000, debug=True)