import { get, set, del, keys } from 'idb-keyval';

export interface LocalGame {
  id: string;
  name: string;
  size: number;
  date: number;
  data: Uint8Array; // The actual PDF data
  iconUrl?: string; // Optional custom icon
  wikipediaUrl?: string; // Optional Wikipedia link
}

const STORAGE_KEY_PREFIX = 'rulebook_';

export async function saveRulebookLocally(file: File): Promise<LocalGame> {
  const id = crypto.randomUUID();
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  
  const game: LocalGame = {
    id,
    name: file.name,
    size: file.size,
    date: Date.now(),
    data: uint8Array
  };
  
  await set(`${STORAGE_KEY_PREFIX}${id}`, game);
  return game;
}

export async function fetchLocalLibrary(): Promise<LocalGame[]> {
  const allKeys = await keys();
  const rulebookKeys = allKeys.filter(k => k.toString().startsWith(STORAGE_KEY_PREFIX));
  
  const games: LocalGame[] = [];
  for (const key of rulebookKeys) {
    const game = await get<LocalGame>(key);
    if (game) games.push(game);
  }
  
  return games.sort((a, b) => b.date - a.date);
}

export async function deleteRulebookLocally(id: string) {
  await del(`${STORAGE_KEY_PREFIX}${id}`);
}

export async function renameRulebookLocally(id: string, newName: string) {
  const key = `${STORAGE_KEY_PREFIX}${id}`;
  const game = await get<LocalGame>(key);
  if (game) {
    game.name = newName;
    await set(key, game);
  }
}

export async function updateRulebookIconLocally(id: string, iconUrl: string) {
  const key = `${STORAGE_KEY_PREFIX}${id}`;
  const game = await get<LocalGame>(key);
  if (game) {
    game.iconUrl = iconUrl;
    await set(key, game);
  }
}

export async function updateRulebookWikipediaLocally(id: string, wikipediaUrl: string) {
  const key = `${STORAGE_KEY_PREFIX}${id}`;
  const game = await get<LocalGame>(key);
  if (game) {
    game.wikipediaUrl = wikipediaUrl;
    await set(key, game);
  }
}

export async function getBase64FromUint8Array(arr: Uint8Array): Promise<string> {
  const blob = new Blob([arr], { type: 'application/pdf' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
