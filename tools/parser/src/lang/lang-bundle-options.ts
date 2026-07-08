import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface LangBundleLoadOptions {
  downloadModJars: boolean;
}

/** Env `TFG_DOWNLOAD_MOD_JARS=0` or argv `--no-download-mod-jars` disables JAR fetch. */
export function resolveLangBundleOptions(
  argv: string[] = process.argv,
  cacheRoot = join(process.cwd(), '.cache'),
): LangBundleLoadOptions {
  if (argv.includes('--no-download-mod-jars')) {
    return { downloadModJars: false };
  }
  if (argv.includes('--download-mod-jars')) {
    return { downloadModJars: true };
  }
  const env = process.env.TFG_DOWNLOAD_MOD_JARS;
  if (env === '0' || env === 'false') {
    return { downloadModJars: false };
  }
  if (env === '1' || env === 'true') {
    return { downloadModJars: true };
  }
  const hasModpackCache = existsSync(join(cacheRoot, 'modpack'));
  return { downloadModJars: hasModpackCache };
}
