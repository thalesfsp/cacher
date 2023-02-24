default: ci

dev:
	npm run dev

build:
	npm run build

watch:
	npm run watch

lint:
	npm run lint

publish:
	npm run publish

clean:
	rm -rdf node_modules && npm i

unit-test:
	npm run test

e2e-test:
	echo "To be implemented"

echo-ok:
	@echo "OK";

ci: lint unit-test echo-ok
ci-e2e-test: ci e2e-test echo-ok
pre-commit: ci build echo-ok
