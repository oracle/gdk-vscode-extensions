suite(process.env['testName'] ?? "API Tests: " + process.env['test'], function () {
    this.timeout(0);
    const tests = process.env['tests']?.split(';');
    if (tests) {
        tests.forEach(t => require(t));
    } else {
        console.log('No tests found.');
    }
});