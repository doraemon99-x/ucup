import express from 'express';

const app = express();

// Validasi environment variable dari Koyeb dashboard
const COOKIE_HEADER = process.env.YT_COOKIE;
if (!COOKIE_HEADER) {
  console.error('❌ Error: YT_COOKIE environment variable is required');
  console.error('Set it from Koyeb dashboard: Settings > Environment variables');
  process.exit(1);
}

// Validasi path untuk berbagai format URL YouTube
function isValidYouTubePath(path) {
  // Support: /@handle, /channel/ID, /c/custom, /user/username, /live/videoID
  const patterns = [
    /^\/@[A-Za-z0-9._-]{3,30}$/, // @handle
    /^\/channel\/[A-Za-z0-9_-]+$/, // channel ID
    /^\/c\/[A-Za-z0-9_-]+$/, // custom URL
    /^\/user\/[A-Za-z0-9_-]+$/, // legacy username
    /^\/live\/[A-Za-z0-9_-]{8,16}$/ // video ID
  ];
  
  return patterns.some(pattern => pattern.test(path));
}

// Handler utama untuk semua pattern
async function handleYouTubeRequest(targetPath, res) {
  // targetPath sudah dalam format /channel/xxx, /@xxx, dll
  const url = `https://www.youtube.com${targetPath}/live`;

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
      console.error(`YouTube error: ${response.status} for path ${targetPath}`);
      return res.status(response.status).send(`YouTube error: ${response.status}`);
    }

    const html = await response.text();
    const hlsMatch = html.match(/"hlsManifestUrl":"([^"]+\.m3u8[^"]*)"/);
    
    if (hlsMatch && hlsMatch[1]) {
      const manifestUrl = hlsMatch[1].replace(/\\u0026/g, '&');
      res.setHeader('Cache-Control', 'private, max-age=30');
      return res.redirect(302, manifestUrl);
    } else {
      console.warn(`No m3u8 found for path ${targetPath}`);
      return res.status(404).send('No HLS manifest found. Stream may be offline.');
    }
  } catch (err) {
    console.error(`Fetch error for ${targetPath}:`, err.message);
    return res.status(500).send('Internal server error');
  }
}

// Route untuk @handle
app.get('/@:handle', async (req, res) => {
  const handle = req.params.handle;
  const targetPath = `/@${handle}`;
  
  if (!isValidYouTubePath(targetPath)) {
    return res.status(400).send('Invalid handle format');
  }
  
  await handleYouTubeRequest(targetPath, res);
});

// Route untuk /channel/CHANNEL_ID
app.get('/channel/:id', async (req, res) => {
  const channelId = req.params.id;
  const targetPath = `/channel/${channelId}`;
  
  if (!isValidYouTubePath(targetPath)) {
    return res.status(400).send('Invalid channel ID format');
  }
  
  await handleYouTubeRequest(targetPath, res);
});

// Route untuk /c/CUSTOM_NAME (legacy custom URL)
app.get('/c/:name', async (req, res) => {
  const customName = req.params.name;
  const targetPath = `/c/${customName}`;
  
  if (!isValidYouTubePath(targetPath)) {
    return res.status(400).send('Invalid custom URL format');
  }
  
  await handleYouTubeRequest(targetPath, res);
});

// Route untuk /user/USERNAME (legacy username)
app.get('/user/:username', async (req, res) => {
  const username = req.params.username;
  const targetPath = `/user/${username}`;
  
  if (!isValidYouTubePath(targetPath)) {
    return res.status(400).send('Invalid username format');
  }
  
  await handleYouTubeRequest(targetPath, res);
});

// Route untuk /live/VIDEO_ID (video ID spesifik)
app.get('/live/:id', async (req, res) => {
  const videoId = req.params.id;
  const targetPath = `/live/${videoId}`;
  
  if (!isValidYouTubePath(targetPath)) {
    return res.status(400).send('Invalid video ID format');
  }
  
  await handleYouTubeRequest(targetPath, res);
});

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Root endpoint dengan dokumentasi
app.get('/', (req, res) => {
  res.send(`
    <h1>YouTube HLS Proxy</h1>
    <p>Supported URL patterns:</p>
    <ul>
      <li><code>/@handle</code> - e.g., /@youtubecreators</li>
      <li><code>/channel/CHANNEL_ID</code> - e.g., /channel/UCX6OQ3DkcsbYNE6H8uQQuVA</li>
      <li><code>/c/CUSTOM_NAME</code> - e.g., /c/YouTubeCreators</li>
      <li><code>/user/USERNAME</code> - e.g., /user/YouTube</li>
      <li><code>/live/VIDEO_ID</code> - e.g., /live/jfKfPfyJRdk</li>
    </ul>
  `);
});

// 404 fallback
app.use((req, res) => res.status(404).send('Endpoint not found'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📦 Node.js version: ${process.version}`);
});
