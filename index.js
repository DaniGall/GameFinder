const fs = require("fs");
const http = require("http");
const https = require("https");

// --- Configuration ---
const credentials = require("./auth/credentials.json");
const port = process.env.PORT || 3000;

const rawg_api_key = process.env.RAWG_API_KEY || credentials.rawg_api_key;
const youtube_api_key = process.env.YOUTUBE_API_KEY || credentials.youtube_api_key;

const rawg_api_base = "https://api.rawg.io/api/games"; // RAWG API endpoint for searching games
const youtube_api_base = "https://www.googleapis.com/youtube/v3/search"; // YouTube Data API v3 endpoint for searching videos
const cache_file = "cache/api-cache.json";

// --- Headers ---
const response_headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Transfer-Encoding": "chunked"
};

// --- Cache Setup ---
let cache = load_cache();

// --- Server Setup ---
const server = http.createServer();
server.on("request", handle_request);
server.on("listening", handle_listen);
server.listen(port);

// --- Handlers ---
function handle_listen(){
    console.log(`Now Listening on Port ${port}`);
}

function handle_request(req, res){
    console.log(`New Request from ${req.socket.remoteAddress} for ${req.url}`);

    if(req.url === "/"){
        const form = fs.createReadStream("html/index.html");
        res.writeHead(200, response_headers);
        form.pipe(res);
    }
    else if(req.url.startsWith("/search")){
        const queryIndex = req.url.indexOf('?');
        const queryString = queryIndex !== -1 ? req.url.slice(queryIndex + 1) : '';
        const user_input = new URLSearchParams(queryString);

        if(!user_input.has("game") || user_input.get("game").trim() === ""){
            return not_found(res, "Please enter a video game title.");
        }

        if(!rawg_api_key || !youtube_api_key){
            return not_found(res, "Please add your RAWG and YouTube API keys in auth/credentials.json.");
        }

        const game = user_input.get("game").trim();

        res.writeHead(200, response_headers);
        get_rawg_data(game, res);
    }
    else if(req.url === "/favicon.ico"){
        res.writeHead(204);
        return res.end();
    }
    else{
        return not_found(res, "Page not found.");
    }
}

function not_found(res, message){
    res.writeHead(404, response_headers);
    res.end(`<h1>404 Not Found</h1><p>${escape_html(message)}</p><p><a href="/">Go back</a></p>`);
}

// --- Utility Functions ---

function process_http_stream(stream, callback, ...args){
    const {statusCode: status_code} = stream;
    let body = "";

    stream.on("data", function(chunk){
        body += chunk;
    });

    stream.on("end", function(){
        callback(body, status_code, ...args);
    });
}

function load_cache(){
    try{
        if(fs.existsSync(cache_file)){
            const data = fs.readFileSync(cache_file, "utf8");
            return JSON.parse(data);
        }
    }
    catch(error){
        console.log("Cache could not be loaded.");
    }
    return {};
}

function save_cache(){
    try{
        fs.writeFileSync(cache_file, JSON.stringify(cache, null, 2));
    }
    catch(error){
        console.log("Cache could not be saved.");
    }
}

function escape_html(text){
    if(text === undefined || text === null){
        return "";
    }
    
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Access Web Services ---
function get_rawg_data(game, res){
    const cache_key = `rawg-${game.toLowerCase()}`;

    if(cache[cache_key]){
        console.log("Using cached RAWG data.");
        return parse_rawg(cache[cache_key], 200, {game, cached:true}, res);
    }

    const rawg_url = new URL(rawg_api_base);
    rawg_url.searchParams.set("search", game);
    rawg_url.searchParams.set("key", rawg_api_key);

    console.log("API 1 has been called: RAWG");
    const rawg_api = https.request(rawg_url);
    const request_data = {game, cache_key, cached:false};

    rawg_api.once("response", function(rawg_res){
        process_http_stream(rawg_res, parse_rawg, request_data, res);
    });

    rawg_api.once("error", function(){
        res.end(`<h2>RAWG request failed.</h2></div></body></html>`); 
    });

    rawg_api.end();
}

function get_youtube_data(game_title, game_object, res){
    const cache_key = `youtube-${game_title.toLowerCase()}`;

    if(cache[cache_key]){
        console.log("Using cached YouTube data.");
        return parse_youtube(cache[cache_key], 200, {game_title, game_object, cached:true}, res);
    }

    const youtube_url = new URL(youtube_api_base);
    youtube_url.searchParams.set("part", "snippet");
    youtube_url.searchParams.set("q", `${game_title} gameplay trailer`);
    youtube_url.searchParams.set("type", "video");
    youtube_url.searchParams.set("maxResults", "1");
    youtube_url.searchParams.set("key", youtube_api_key);

    console.log("API 2 has been called: YouTube");
    const youtube_api = https.request(youtube_url);
    const request_data = {game_title, game_object, cache_key, cached:false};

    youtube_api.once("response", function(youtube_res){
        process_http_stream(youtube_res, parse_youtube, request_data, res);
    });

    youtube_api.once("error", function(){
        res.end(`<h2>YouTube request failed.</h2></div></body></html>`);
    });

    youtube_api.end();
}

// --- Parse Responses ---

function parse_rawg(rawg_json, status_code, request_data, res){
    let rawg_object;

    if(request_data.cached){
        rawg_object = rawg_json;
    }
    else{
        rawg_object = JSON.parse(rawg_json);
        cache[request_data.cache_key] = rawg_object;
        save_cache();
    }

    const game_object = rawg_object?.results?.[0];

    if(status_code !== 200 || !game_object){
        res.end(`<h2>No game was found for ${escape_html(request_data.game)}.</h2></div></body></html>`);
        return;
    }

    const game_title = game_object.name;

    // This is the important synchronous part:
    // YouTube is only called after RAWG has responded and has been parsed.
    get_youtube_data(game_title, game_object, res);
}

function parse_youtube(youtube_json, status_code, request_data, res){
    let youtube_object;

    if(request_data.cached){
        youtube_object = youtube_json;
    }
    else{
        youtube_object = JSON.parse(youtube_json);
        cache[request_data.cache_key] = youtube_object;
        save_cache();
    }

    const results_html = format_results(request_data.game_object, youtube_object);
    res.end(results_html);
}

// --- Format Results ---

function format_results(game, youtube_object){
    const name = game?.name || "Unknown title";
    const rating = game?.rating || "N/A";
    const released = game?.released || "N/A";
    const background_image = game?.background_image || "";

    const genres = game?.genres?.length
        ? game.genres.map(function(genre){ return genre.name; }).join(", ")
        : "N/A";

    const platforms = game?.platforms?.length
        ? game.platforms.map(function(item){ return item.platform.name; }).join(", ")
        : "N/A";

    let video_html = `<p>No YouTube video was found.</p>`;
    const video = youtube_object?.items?.[0];

    if(video?.id?.videoId){
        const video_id = video.id.videoId;
        const video_title = video.snippet.title;
        video_html = `
            <h3>${escape_html(video_title)}</h3>
            <iframe width="560" height="315" src="https://www.youtube.com/embed/${escape_html(video_id)}" title="YouTube video player" frameborder="0" allowfullscreen></iframe>
        `;
    }

    return `
<!DOCTYPE html>
<html>
<head>
    <title>${escape_html(name)}</title>

    <style>
        body{
            font-family:sans-serif;
            max-width:900px;
            margin:20px auto;
            line-height:1.6;
        }

        img{
            max-width:100%;
            border-radius:10px;
        }

        section{
            margin-bottom:30px;
        }
    </style>
</head>

<body>

        <section>
            <h2>${escape_html(name)}</h2>
            ${background_image ? `<img src="${escape_html(background_image)}" alt="${escape_html(name)} screenshot" />` : ""}
        </section>

        <section>
           <!-- RAWG -->
            <h2>Game Info</h2>
            <p><strong>Rating:</strong> ${escape_html(rating)}</p>
            <p><strong>Released:</strong> ${escape_html(released)}</p>
            <p><strong>Genres:</strong> ${escape_html(genres)}</p>
            <p><strong>Platforms:</strong> ${escape_html(platforms)}</p>
        </section>

        <section>
           <!-- YOUTUBE V3 -->
            <h2>Trailer</h2>
            ${video_html}
        </section>

        <section>
            <h2>Synchronous Order</h2>
            <p>The server calls RAWG first. YouTube is called inside the RAWG response callback, so the second API waits for the first API to finish.</p>
        </section>

        <p><a href="/">Search again</a></p>

</body>
</html>
`;
}