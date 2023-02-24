const { pathsToModuleNameMapper } = require('ts-jest');
const { compilerOptions } = require('./tsconfig.json');

module.exports = {
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, { prefix: '<rootDir>/src' }),
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: { '^.+\\.tsx?$': 'ts-jest', },
};
