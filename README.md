# Crestle 🛡️

**Guess the football club crest.**

A daily-style guessing game — infinite mode. Each round you're shown a blurred crest that sharpens with every wrong guess. Five hints unlock progressively: country, league, colours, stadium, and city.

**Play it → [crestle.netlify.app](https://crestle.netlify.app)**

---

## How it works

Each round:
1. A random club crest is shown, heavily blurred
2. You type a club name and submit
3. Wrong guess → crest gets slightly clearer + a new hint unlocks
4. You have 6 attempts to identify the club
5. Hit "Next Crest" to play again — infinite rounds

---

## Stack

| Layer    | Technology                          |
|----------|-------------------------------------|
| Frontend | HTML · CSS · Vanilla JS             |
| Backend  | Python · Flask · gunicorn           |
| Database | SQLite                              |
| Data     | [TheSportsDB](https://thesportsdb.com) (team names, crests, colours) |
| Hosting  | Netlify (frontend) · Render (backend) |

---

## Project structure

```
crestle/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── game.js
├── backend/
│   ├── server.py      # Flask API
│   ├── database.py    # SQLite access layer
│   ├── crestle.db     # SQLite database
│   └── crests/        # Downloaded crest images (PNG)
├── seed/
│   └── seed.py        # Data extraction script
├── requirements.txt
├── render.yaml
└── .gitignore
```

---

## Running locally

**Requirements:** Python 3.8+, pip

```bash
# Clone
git clone https://github.com/tu-usuario/crestle.git
cd crestle

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the backend
cd backend
python server.py

# In a second terminal, serve the frontend
cd frontend
python -m http.server 8000
```

Open `http://localhost:8000` in your browser.

> The frontend expects the backend at `http://localhost:5000`.
> If you want to use the production backend instead, change `API_BASE`
> in `frontend/game.js`.

---

## Updating the dataset

The `seed/seed.py` script fetches team data from TheSportsDB and
rebuilds the database and crests folder. Run it when you want to
refresh or expand the dataset:

```bash
cd seed
python seed.py
```

> Requires an internet connection. Free tier of TheSportsDB returns
> up to 10 teams per league endpoint.

---

## Feedback & bugs

Found a bug or want to suggest a club or league?
[Open an issue on GitHub](https://github.com/hgomezm92/crestle/issues)

---

## Notes

Built as a personal learning project to explore full-stack web
development — Flask, SQLite, REST APIs, CORS, and deployment.
Developed with the assistance of [Claude](https://claude.ai) (Anthropic).

Club data and crest images provided by
[TheSportsDB](https://thesportsdb.com) under their free tier.
All trademarks and logos belong to their respective clubs.