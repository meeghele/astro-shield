# Copyright (c) 2025 Michele Tavella <meeghele@proton.me>
# Licensed under the MIT License. See LICENSE file for details.

default: all

.PHONY: all
all: install lint test build

.PHONY: install
install:
	bun install

.PHONY: deps
deps:
	cd app && bunx playwright install --with-deps chromium firefox

.PHONY: build
build:
	bun run build

.PHONY: dev
dev:
	bun run dev

.PHONY: test
test:
	bun run test

.PHONY: lint
lint:
	bun run lint

.PHONY: clean
clean:
	rm -rf node_modules
	rm -rf core/node_modules
	rm -rf app/node_modules
	rm -rf core/dist
	rm -rf app/dist
	rm -rf app/.astro
	rm -rf test-results
	rm -rf app/test-results
	rm -rf playwright-report

.PHONY: ci
ci:
	act

.PHONY: publish
publish:
	cd core && bun publish --access public
