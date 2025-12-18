import express from 'express';

const app = express();

// --- ENV CHECK --------------------------------------------------

const COOKIE_HEADER = process.env.YT_COOKIE;
if (!COOKIE_HEADER) {
  console.error('❌ Error: YT_COOKIE environment variable is required');
  process.exit(1);
}

// --- VALIDATION --------------------------------------------------

function isValidYouTubePath(path) {
  const patterns = [
    /^\/@[A-Za-z0-9._-]{3,30}$/,
    /^\/channel\/[A-Za-z0-9_-]+$/,
    /^\/c\/[A-Za-z0-9_-]+$/,
    /^\/user\/[A-Za-z0-9_-]+$/,
    /^\/watch\?v=[A-Za-z0-9_-]{8,16}$/
  ];
  return patterns.some(pattern => pattern.test(path));
}

// --- CORE HANDLER -----------------------------------------------

async function handleYouTubeRequest(targetPath, res) {
  // Tentukan URL:
  let url;

  // Jika target adalah watch?v=ID, maka langsung ambil halaman video
  if (targetPath.startsWith('/watch')) {
    url = `https://www.youtube.com${targetPath}`;
  } else {
    // selain itu diarahkan ke halaman /live dari channel/user
    url = `https://www.youtube.com${targetPath}/live`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'Cookie': COOKIE_HEADER,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      console.error(`YouTube error: ${response.status} on ${targetPath}`);
      return res.status(response.status).send(`YouTube error: ${response.status}`);
    }

    const html = await response.text();

    // Regex yang lebih kuat → cari di seluruh HTML
    const hlsMatch = html.match(/"hlsManifestUrl":"([^"]+?\.m3u8[^"]*?)"/);

    if (hlsMatch && hlsMatch[1]) {
      const manifestUrl = hlsMatch[1].replace(/\\u0026/g, '&');

      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.redirect(302, manifestUrl);
    }

    return res.status(404).send('No HLS manifest found. Stream may be offline.');

  } catch (err) {
    console.error(`Fetch error:`, err.message);
    return res.status(500).send('Internal server error');
  }
}

// --- ROUTES ------------------------------------------------------

// @handle
app.get('/@:handle', async (req, res) => {
  const targetPath = `/@${req.params.handle}`;
  if (!isValidYouTubePath(targetPath)) return res.status(400).send('Invalid handle');
  await handleYouTubeRequest(targetPath, res);
});

// /channel/ID
app.get('/channel/:id', async (req, res) => {
  const targetPath = `/channel/${req.params.id}`;
  if (!isValidYouTubePath(targetPath)) return res.status(400).send('Invalid channel ID');
  await handleYouTubeRequest(targetPath, res);
});

// /c/customUrl
app.get('/c/:name', async (req, res) => {
  const targetPath = `/c/${req.params.name}`;
  if (!isValidYouTubePath(targetPath)) return res.status(400).send('Invalid custom URL');
  await handleYouTubeRequest(targetPath, res);
});

// /user/username
app.get('/user/:user', async (req, res) => {
  const targetPath = `/user/${req.params.user}`;
  if (!isValidYouTubePath(targetPath)) return res.status(400).send('Invalid username');
  await handleYouTubeRequest(targetPath, res);
});

// /live/videoID → now convert to /watch?v=ID
app.get('/live/:id', async (req, res) => {
  const videoId = req.params.id;

  const targetPath = `/watch?v=${videoId}`;
  if (!isValidYouTubePath(targetPath)) return res.status(400).send('Invalid video ID');
  await handleYouTubeRequest(targetPath, res);
});

// health
app.get('/health', (req, res) => res.send("OK"));

// home
app.get('/', (req, res) => {
  res.send(`
    <h1>YouTube HLS Proxy</h1>
    <p>Try examples:</p>
    <ul>
      <li>/@youtube</li>
      <li>/channel/UCX6OQ3DkcsbYNE6H8uQQuVA</li>
      <li>/c/YouTubeCreators</li>
      <li>/user/YouTube</li>
      <li>/live/jfKfPfyJRdk</li>
    </ul>
  `);
});

// fallback 404
app.use((req, res) => res.status(404).send("Endpoint not found"));

// --- SERVER START -----------------------------------------------

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
