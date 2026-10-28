# GameFinder — Video Game Search Engine

A CS355 final project that combines game information from RAWG with a related YouTube gameplay trailer. Users enter a game title in a web form and receive a results page with game details and an embedded video.

## Features

- Search for a video game by title.
- Display the first RAWG match, including its image, rating, release date, genres, and platforms.
- Search YouTube using the matched game title plus `gameplay trailer` and embed the first video returned.
- Cache API responses in memory and in a local JSON file to reuse results across searches and server restarts.
- Escape text inserted into generated HTML.

## Technology

- Node.js with the built-in `http`, `https`, and `fs` modules
- HTML and CSS
- RAWG API
- YouTube Data API v3

No third-party Node.js packages or build step are required. The archive does not include a `package.json`; run the server directly with Node.js.

## Project Structure

```text
GameFinder/
├── index.js                 # HTTP server, API requests, caching, and results HTML
├── html/
│   └── index.html           # Search form and styles
├── auth/
│   └── credentials.json     # API key configuration
└── cache/
    └── api-cache.json       # Created when API responses are saved
```

## Setup

1. Install Node.js and extract the project archive.
2. Open a terminal in the extracted `GameFinder` directory.
3. Obtain a RAWG API key and a YouTube Data API v3 key.
4. Copy the example configuration, then replace its placeholders with your own keys:

   ```sh
   cp auth/credentials.example.json auth/credentials.json
   ```

   The file should contain:

   ```json
   {
     "rawg_api_key": "YOUR_RAWG_API_KEY",
     "youtube_api_key": "YOUR_YOUTUBE_API_KEY"
   }
   ```

5. Ensure the cache directory exists:

   ```sh
   mkdir -p cache
   ```

6. Start the server:

   ```sh
   node index.js
   ```

7. Open **http://localhost:3000** in a browser.

Run the command from the project directory because the HTML and cache paths are relative to the current working directory.

### Environment Variables

Environment variables override the values in `credentials.json`:

```sh
export RAWG_API_KEY="YOUR_RAWG_API_KEY"
export YOUTUBE_API_KEY="YOUR_YOUTUBE_API_KEY"
node index.js
```

The server still loads `auth/credentials.json` at startup, so that file must exist and contain valid JSON even when both keys are supplied through environment variables. It can contain `{}` in that case. The application does not automatically load a `.env` file.

To use another port:

```sh
PORT=8080 node index.js
```

Then open **http://localhost:8080**.

Keep real API keys out of public repositories. For a Git repository, add `auth/credentials.json` and `cache/api-cache.json` to `.gitignore` and share a credentials example containing placeholders instead.

## Usage

1. Enter a game title, such as `Minecraft`.
2. Select **Search**.
3. View the matched game's details and related video.
4. Select **Search again** to return to the form.

You can also search directly through a URL:

```text
http://localhost:3000/search?game=Minecraft
```

The app selects the first RAWG result automatically; it does not provide a list of matches to choose from. The YouTube result is a search match and is not guaranteed to be an official trailer.

## How It Works

```text
Browser search
    → RAWG lookup or cached response
    → First matching game's title
    → YouTube lookup or cached response
    → Generated HTML results page
```

The API calls run sequentially: the YouTube lookup starts after the RAWG response has been received and parsed. Both network requests use asynchronous callbacks; this sequence does not make them blocking, synchronous operations.

### Routes

| Route | Behavior |
| --- | --- |
| `/` | Serves the search form. |
| `/search?game=<title>` | Searches for a game and renders results. |
| `/favicon.ico` | Returns HTTP 204 with no content. |
| Other paths | Returns a 404 page. |

### Caching

RAWG responses are keyed by the lowercase search term. YouTube responses are keyed by the lowercase matched game title. The cache is loaded from `cache/api-cache.json` at startup and saved after responses are parsed.

There is no cache expiration. To refresh cached results, stop the server, delete `cache/api-cache.json`, and restart the server. Restarting is necessary because the server also holds the cache in memory.

## Troubleshooting

| Issue | What to check |
| --- | --- |
| Server cannot load credentials | Confirm `auth/credentials.json` exists and contains valid JSON. |
| Missing API keys message | Supply both keys through the credentials file or environment variables. |
| No game found | Try another title; also check the RAWG key and API availability. |
| No YouTube video found | Check the YouTube key, API access, and quota; the search may also return no videos. |
| Cache could not be saved | Confirm `cache/` exists and is writable. |
| Results remain outdated | Stop the server, remove the cache file, and restart. |
| Port is already in use | Set `PORT` to another available port. |

## Current Limitations

- The archive includes no automated tests or test script.
- API response JSON is parsed without a parsing error handler, and outbound requests have no explicit timeout.
- Parsed API error responses can be cached. YouTube response status codes are not explicitly checked before rendering.
- Empty searches and missing API keys return a 404 response; searches that reach the API lookup receive an initial 200 response even if a later lookup fails.
- Only one game and one video are displayed per search.
