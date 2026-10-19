// The picker app's identity on this phone: a random id and the name the picker typed once.
// Reporters see the name when their spot is taken. (Real accounts come later.)

const KEY = 'safai-saathi:picker';

export function loadProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return profile?.id && profile?.name ? profile : null;
  } catch {
    return null;
  }
}

export function saveProfile(name) {
  const previous = loadProfile();
  const profile = { id: previous?.id ?? `pk-${crypto.randomUUID()}`, name: name.trim().slice(0, 40) };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // The name lasts for this visit only.
  }
  return profile;
}
