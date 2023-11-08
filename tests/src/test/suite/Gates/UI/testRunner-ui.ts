describe(process.env['testName'] ?? 'UI Tests:', function () {
  const tests = process.env['tests']?.split(';');
  if (tests && tests.length !== 0) {
    tests.forEach((t) => require(t));
  } else {
    console.log('No tests found.');
  }
});
