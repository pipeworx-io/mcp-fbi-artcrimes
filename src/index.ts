interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * FBI Art Crimes MCP — FBI National Stolen Art File (free, no auth).
 *
 * Stolen and missing artworks the FBI is investigating across active art theft
 * cases. Backed by the public api.fbi.gov/@artcrimes endpoint.
 *
 * Tools:
 * - list_art_crimes: Browse/search stolen & missing artworks (paginated).
 * - get_art_crime: Full record for one stolen artwork by UID.
 */


const BASE = 'https://api.fbi.gov/@artcrimes';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'list_art_crimes',
    description:
      'Browse or search the FBI National Stolen Art File — stolen and missing artworks under active FBI art theft investigations. Returns artwork UIDs, titles, descriptions, maker/artist, materials, measurements, period, and a thumbnail image URL. Filter by title or maker substring. Use page to paginate. Pass a UID into get_art_crime for the full record.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number for pagination (default 1).' },
        title: { type: 'string', description: 'Filter by title substring (e.g., a work or object name).' },
        maker: { type: 'string', description: 'Filter by artist/maker substring (e.g., a painter or publisher).' },
      },
      required: [],
    },
  },
  {
    name: 'get_art_crime',
    description:
      'Get the full record for a single stolen or missing artwork from the FBI National Stolen Art File by UID. Returns title, full description, crime category, maker/artist, materials, measurements, period, additional data, all images, and the FBI case URL. Use a UID returned by list_art_crimes.',
    inputSchema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'The artwork UID from a list_art_crimes result.' },
      },
      required: ['uid'],
    },
  },
];

interface ArtImage {
  original?: string | null;
  thumb?: string | null;
  large?: string | null;
  caption?: string | null;
}

interface ArtItem {
  uid: string;
  title?: string | null;
  description?: string | null;
  crimeCategory?: string | null;
  maker?: string | null;
  materials?: string | null;
  measurements?: string | null;
  period?: string | null;
  additionalData?: string | null;
  images?: ArtImage[] | null;
  modified?: string | null;
  path?: string | null;
  pathId?: string | null;
}

interface ListResponse {
  total?: number;
  page?: number;
  items?: ArtItem[] | null;
}

function stripHtml(s: string | null | undefined): string {
  return (s || '').replace(/<[^>]+>/g, '');
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'list_art_crimes':
      return listArtCrimes(args.page as number | undefined, args.title as string | undefined, args.maker as string | undefined);
    case 'get_art_crime':
      return getArtCrime(args.uid as string);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function listArtCrimes(page = 1, title?: string, maker?: string): Promise<unknown> {
  const params = new URLSearchParams({ page: String(page || 1) });
  if (title) params.set('title', title);
  if (maker) params.set('maker', maker);

  const res = await fetch(`${BASE}/?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    return { error: res.status, message: await res.text().then((t) => t.slice(0, 500)) };
  }

  const data = (await res.json()) as ListResponse;

  return {
    total: data.total,
    page: data.page,
    items: (data.items ?? []).map((i) => ({
      uid: i.uid,
      title: i.title,
      description: stripHtml(i.description).slice(0, 400),
      category: i.crimeCategory,
      maker: i.maker,
      materials: i.materials,
      measurements: i.measurements,
      period: i.period,
      image: i.images?.[0]?.original || i.images?.[0]?.large,
      url: i.path ? 'https://www.fbi.gov' + i.path : undefined,
    })),
  };
}

async function getArtCrime(uid: string): Promise<unknown> {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Required argument "uid" is missing or empty. Pass a UID from a list_art_crimes result.');
  }

  const res = await fetch(`${BASE}/${encodeURIComponent(uid)}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    return { error: res.status, message: await res.text().then((t) => t.slice(0, 500)) };
  }

  const i = (await res.json()) as ArtItem;

  return {
    uid: i.uid,
    title: i.title,
    description: stripHtml(i.description).slice(0, 1500),
    category: i.crimeCategory,
    maker: i.maker,
    materials: i.materials,
    measurements: i.measurements,
    period: i.period,
    additional_data: stripHtml(i.additionalData),
    images: (i.images ?? []).map((im) => ({ url: im.original || im.large, caption: im.caption })),
    url: i.path ? 'https://www.fbi.gov' + i.path : undefined,
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
