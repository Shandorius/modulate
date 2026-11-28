const test = require('node:test');
const assert = require('node:assert/strict');
const {
  request,
  pool,
  makeApp,
  resetDatabase,
  register,
  seedTrack,
} = require('./helpers');

let app;

test.before(async () => {
  app = await makeApp();
});

test.beforeEach(async () => {
  await resetDatabase();
});

test.after(async () => {
  await pool.end();
});

async function issueKey(agent, label = 'Music Assistant') {
  const response = await agent
    .post('/api/v1/integrations/subsonic/keys')
    .send({ label })
    .expect(201);
  return response.body.data;
}

function rest(key, method, query = {}) {
  return request(app)
    .get(`/rest/${method}`)
    .query({ apiKey: key, ...query });
}

test('the OpenSubsonic endpoint requires a valid API key', async () => {
  const agent = request.agent(app);
  await register(agent, 'subsonic-auth@example.com');

  const missing = await request(app).get('/rest/ping').expect(200);
  assert.equal(missing.body['subsonic-response'].status, 'failed');
  assert.equal(missing.body['subsonic-response'].error.code, 44);

  const invalid = await request(app)
    .get('/rest/ping')
    .query({ apiKey: 'modtest_not-a-real-key' })
    .expect(200);
  assert.equal(invalid.body['subsonic-response'].status, 'failed');
  assert.equal(invalid.body['subsonic-response'].error.code, 44);

  const issued = await issueKey(agent);
  const ok = await rest(issued.token, 'ping').expect(200);
  assert.equal(ok.body['subsonic-response'].status, 'ok');
  assert.equal(ok.body['subsonic-response'].openSubsonic, true);

  const conflict = await request(app)
    .get('/rest/ping')
    .query({ apiKey: issued.token, u: 'someone' })
    .expect(200);
  assert.equal(conflict.body['subsonic-response'].error.code, 43);
});

test('revoking an API key immediately stops access', async () => {
  const agent = request.agent(app);
  await register(agent, 'subsonic-revoke@example.com');
  const issued = await issueKey(agent);

  const listed = await agent.get('/api/v1/integrations/subsonic').expect(200);
  const key = listed.body.data.keys[0];
  assert.equal(key.label, 'Music Assistant');

  await agent
    .delete(`/api/v1/integrations/subsonic/keys/${key.id}`)
    .expect(200);

  const rejected = await rest(issued.token, 'ping').expect(200);
  assert.equal(rejected.body['subsonic-response'].status, 'failed');
  assert.equal(rejected.body['subsonic-response'].error.code, 44);
});

test('artists, albums, songs, and search are browsable', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'subsonic-browse@example.com');
  const first = await seedTrack(user.id, {
    title: 'Amber Waves',
    artist: 'Beryl',
    albumArtist: 'Beryl',
    album: 'First Light',
    trackNumber: 1,
    releaseYear: 2024,
  });
  await seedTrack(user.id, {
    title: 'Blue Hours',
    artist: 'Beryl',
    albumArtist: 'Beryl',
    album: 'First Light',
    trackNumber: 2,
    releaseYear: 2024,
  });
  const other = await seedTrack(user.id, {
    title: 'Cobalt',
    artist: 'Amber',
    albumArtist: 'Amber',
    album: 'Second Wind',
    trackNumber: 1,
    releaseYear: 2022,
  });
  const issued = await issueKey(agent);

  const extensions = await rest(
    issued.token,
    'getOpenSubsonicExtensions',
  ).expect(200);
  assert.deepEqual(
    extensions.body['subsonic-response'].openSubsonicExtensions.map(
      (extension) => extension.name,
    ),
    ['apiKeyAuthentication'],
  );

  const artists = await rest(issued.token, 'getArtists').expect(200);
  const indexes = artists.body['subsonic-response'].artists.index;
  assert.equal(
    indexes.flatMap((index) => index.artist.map((artist) => artist.name)).sort().join(','),
    'Amber,Beryl',
  );

  const newest = await rest(issued.token, 'getAlbumList2', {
    type: 'alphabeticalByArtist',
    size: 10,
  }).expect(200);
  const albums = newest.body['subsonic-response'].albumList2.album;
  assert.deepEqual(
    albums.map((album) => album.name),
    ['Second Wind', 'First Light'],
    'alphabeticalByArtist groups by album artist first',
  );
  const firstLight = albums.find((album) => album.name === 'First Light');
  assert.equal(firstLight.songCount, 2);
  assert.equal(firstLight.artist, 'Beryl');

  const page = await rest(issued.token, 'getAlbumList2', {
    type: 'alphabeticalByArtist',
    size: 1,
    offset: 1,
  }).expect(200);
  assert.deepEqual(
    page.body['subsonic-response'].albumList2.album.map((album) => album.name),
    ['First Light'],
  );

  const detail = await rest(issued.token, 'getAlbum', {
    id: firstLight.id,
  }).expect(200);
  const album = detail.body['subsonic-response'].album;
  assert.equal(album.song.length, 2);
  assert.equal(album.song[0].title, 'Amber Waves');
  assert.equal(album.song[0].albumId, album.id);
  assert.equal(album.song[0].parent, album.id);
  assert.equal(album.song[0].artistId.startsWith('ar-'), true);
  assert.equal(album.song[0].duration, 180);

  const song = await rest(issued.token, 'getSong', { id: first.id }).expect(200);
  assert.equal(
    song.body['subsonic-response'].song.title,
    'Amber Waves',
  );

  const byTitle = await rest(issued.token, 'search3', { query: 'cobalt' }).expect(200);
  assert.equal(
    byTitle.body['subsonic-response'].searchResult3.song[0].id,
    other.id,
  );

  const byAlbum = await rest(issued.token, 'search3', { query: 'first light' }).expect(200);
  assert.equal(
    byAlbum.body['subsonic-response'].searchResult3.album[0].name,
    'First Light',
  );

  const artistDetail = await rest(issued.token, 'getArtist', {
    id: album.artistId,
  }).expect(200);
  assert.equal(
    artistDetail.body['subsonic-response'].artist.album[0].name,
    'First Light',
  );

  const artistInfo = await rest(issued.token, 'getArtistInfo2', {
    id: album.artistId,
  }).expect(200);
  assert.deepEqual(
    artistInfo.body['subsonic-response'].artistInfo2,
    {},
  );

  const albumInfo = await rest(issued.token, 'getAlbumInfo2', {
    id: album.id,
  }).expect(200);
  assert.deepEqual(albumInfo.body['subsonic-response'].albumInfo, {});
});

test('playlist visibility follows the Modulate account', async () => {
  const admin = request.agent(app);
  const owner = request.agent(app);

  // The first account on a fresh instance is the administrator.
  await register(admin, 'subsonic-admin@example.com');
  const ownerUser = await register(owner, 'subsonic-owner@example.com');
  const track = await seedTrack(ownerUser.user.id, { title: 'Shared song' });

  const created = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Owner private' })
    .expect(201);
  const privateId = created.body.data.id;
  await owner
    .post(`/api/v1/playlists/${privateId}/tracks`)
    .send({ trackId: track.id })
    .expect(200);

  const publicCreated = await owner
    .post('/api/v1/playlists')
    .send({ name: 'Owner public' })
    .expect(201);
  const publicId = publicCreated.body.data.id;
  await owner
    .post(`/api/v1/playlists/${publicId}/tracks`)
    .send({ trackId: track.id })
    .expect(200);
  await owner
    .patch(`/api/v1/playlists/${publicId}/visibility`)
    .send({ visibility: 'public' })
    .expect(200);

  const adminKey = await issueKey(admin, 'Admin key');
  const ownerKey = await issueKey(owner, 'Owner key');

  const ownerPlaylists = await rest(ownerKey.token, 'getPlaylists').expect(200);
  assert.deepEqual(
    ownerPlaylists.body['subsonic-response'].playlists.playlist.map(
      (playlist) => playlist.name,
    ),
    ['Owner private', 'Owner public'],
  );
  const ownerPrivate = ownerPlaylists.body['subsonic-response'].playlists.playlist.find(
    (playlist) => playlist.name === 'Owner private',
  );
  assert.equal(ownerPrivate.public, false);
  assert.equal(ownerPrivate.songCount, 1);

  const adminPlaylists = await rest(adminKey.token, 'getPlaylists').expect(200);
  assert.deepEqual(
    adminPlaylists.body['subsonic-response'].playlists.playlist.map(
      (playlist) => playlist.name,
    ),
    ['Owner public'],
    'admins must not see another account private playlist',
  );

  const privateAccess = await rest(adminKey.token, 'getPlaylist', {
    id: privateId,
  }).expect(200);
  assert.equal(privateAccess.body['subsonic-response'].status, 'failed');
  assert.equal(privateAccess.body['subsonic-response'].error.code, 50);

  const publicAccess = await rest(adminKey.token, 'getPlaylist', {
    id: publicId,
  }).expect(200);
  assert.equal(publicAccess.body['subsonic-response'].status, 'ok');
  assert.equal(
    publicAccess.body['subsonic-response'].playlist.entry[0].id,
    track.id,
  );

  // Sharing adds the playlist to the recipient's list.
  const viewer = request.agent(app);
  const viewerUser = await register(viewer, 'subsonic-viewer@example.com');
  await owner
    .post(`/api/v1/playlists/${privateId}/shares`)
    .send({ userId: viewerUser.user.id, role: 'viewer' })
    .expect(200);
  const viewerKey = await issueKey(viewer, 'Viewer key');
  const viewerPlaylists = await rest(viewerKey.token, 'getPlaylists').expect(200);
  assert.deepEqual(
    viewerPlaylists.body['subsonic-response'].playlists.playlist.map(
      (playlist) => playlist.name,
    ),
    ['Owner private', 'Owner public'],
  );
});

test('streaming, cover art, and favourites work through the API', async () => {
  const agent = request.agent(app);
  const { user } = await register(agent, 'subsonic-media@example.com');
  const track = await seedTrack(user.id, {
    title: 'Artwork song',
    artist: 'Media',
    album: 'Cover art',
  });
  await agent
    .patch(`/api/v1/tracks/${track.id}`)
    .send({ isFavorite: true })
    .expect(200);
  const issued = await issueKey(agent);

  const song = await rest(issued.token, 'getSong', { id: track.id }).expect(200);
  const child = song.body['subsonic-response'].song;
  assert.equal(child.contentType, 'audio/mp4');
  assert.equal(child.suffix, 'm4a');
  assert.equal(typeof child.size, 'number');

  const streamed = await request(app)
    .get('/rest/stream')
    .query({ apiKey: issued.token, id: track.id })
    .set('Range', 'bytes=0-3')
    .expect(206);
  assert.equal(streamed.body.length, 4);
  assert.equal(streamed.headers['accept-ranges'], 'bytes');

  const artwork = await request(app)
    .get('/rest/getCoverArt')
    .query({ apiKey: issued.token, id: child.coverArt })
    .expect(200);
  assert.equal(artwork.headers['content-type'], 'image/jpeg');
  assert.ok(artwork.body.length > 0);

  const starred = await rest(issued.token, 'getStarred2').expect(200);
  assert.equal(
    starred.body['subsonic-response'].starred2.song[0].id,
    track.id,
  );
  assert.equal(
    starred.body['subsonic-response'].starred2.album[0].name,
    'Cover art',
  );

  const lyrics = await rest(issued.token, 'getLyrics', {
    artist: 'Media',
    title: 'Artwork song',
  }).expect(200);
  assert.equal(lyrics.body['subsonic-response'].status, 'failed');
  assert.equal(lyrics.body['subsonic-response'].error.code, 70);

  const structuredLyrics = await rest(issued.token, 'getLyricsBySongId', {
    id: track.id,
  }).expect(200);
  assert.deepEqual(
    structuredLyrics.body['subsonic-response'].lyricsList.structuredLyrics,
    [],
  );

  const folders = await rest(issued.token, 'getMusicFolders').expect(200);
  assert.equal(
    folders.body['subsonic-response'].musicFolders.musicFolder[0].id,
    1,
  );

  const license = await rest(issued.token, 'getLicense').expect(200);
  assert.equal(license.body['subsonic-response'].license.valid, true);

  const unsupported = await rest(issued.token, 'getPodcasts').expect(200);
  assert.equal(unsupported.body['subsonic-response'].status, 'failed');
  assert.equal(unsupported.body['subsonic-response'].error.code, 0);
});
