import type {ParsedRow} from '../../types';
import sampleList from './eca779a46f10e71bfff80aa4493dafedac3417f7bc73a6223c83afea12b22b6a.json';

// Hand-written parse results for known PDFs, keyed by the file's sha256 (see ../README.md). The
// scripted parser validates them like live output.

export const PDF_FIXTURES:Record<string,ParsedRow[]>={
  'eca779a46f10e71bfff80aa4493dafedac3417f7bc73a6223c83afea12b22b6a':sampleList.rows as unknown as ParsedRow[],
};
