import { test } from 'uvu';
import * as assert from 'uvu/assert';

test('test request', async () => {
	console.log("is running")
	const response = await fetch("http://localhost:9011/");
	assert.is("Hello World from Dot!", await response.text())
});

test.run()