import * as extest from 'vscode-extension-tester';

async function main() {
	// run UI extension tests
	try {
		// download code and chromedriver
		let exTester : extest.ExTester = new extest.ExTester();
		await exTester.downloadCode();
		await exTester.downloadChromeDriver();
		
		// Run tests
		await exTester.runTests('**/**.ui-test.js');
	} catch (err) {
		console.error('Failed to run tests', err);
		process.exit(1);
	}
}

main();
