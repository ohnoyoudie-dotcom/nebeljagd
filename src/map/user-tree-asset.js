/** Optional user GLB. The editor includes this model only after it has been
 * added to the tracked work branch. No placeholder geometry is generated. 
 * Using a Vite glob keeps the offline HTML standalone, while plain Node tests
 * can import the shared catalogue even before the model is installed. */
const userTreeUrls = typeof import.meta.glob === 'function'
  ? import.meta.glob('../../assets/imported/user-trees/runtime/*.glb',
      { query: '?url&inline', import: 'default', eager: true })
  : {};

export const USER_TREE1_URL = userTreeUrls['../../assets/imported/user-trees/runtime/tree1.glb'] ?? null;
export const USER_TREE1_AVAILABLE = Boolean(USER_TREE1_URL);
