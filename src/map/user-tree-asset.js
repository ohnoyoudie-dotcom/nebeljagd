/** Optional GLB from the user's FBX: only bundled after the real file was
 * committed on work. Node unit tests lack Vite's import.meta.glob macro.
 * Vite statically transforms the direct call below into the matching assets;
 * the try/catch only applies when this module runs unbundled under Node. */
let userTreeUrls = {};
try {
  userTreeUrls = import.meta.glob('../../assets/imported/user-trees/runtime/*.glb',
    { query: '?url&inline', import: 'default', eager: true });
} catch {
  // Plain Node tests (outside Vite) do not have the import.meta.glob macro.
}
export const USER_TREE1_URL = userTreeUrls['../../assets/imported/user-trees/runtime/tree1.glb'] ?? null;
export const USER_TREE1_AVAILABLE = Boolean(USER_TREE1_URL);
