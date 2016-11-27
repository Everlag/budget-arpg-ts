/* eslint-env node*/

'use strict';

// Include Gulp & tools we'll use
const gulp = require('gulp');
const browserSync = require('browser-sync');
const runSequence = require('run-sequence');
const reload = browserSync.reload;

const gulpIf = require('gulp-if');
const eslint = require('gulp-eslint');

const typescript = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const tslint = require('gulp-tslint');
const tsfmt = require('gulp-typescript-formatter');

// Negation in gulp.src is hilariously slow.
// https://github.com/gulpjs/glob-stream/issues/24
const fastGlob = require('glob');

const transpileTarget = 'entry.js';

// Fetch project details
const tsbuildConf = {
  outFile: transpileTarget,
};
let tsProject = typescript.createProject('./tsconfig.json', tsbuildConf);

function isFixed(file) {
  // Has ESLint fixed the file contents?
  return !(file.eslint === null) && file.eslint.fixed;
}

// Lint javascript
gulp.task('eslint', () => {
  // Define global config for eslint
  const eslintGlobal = {
    fix: true,
  };

  let targets = fastGlob.sync('./**/*.js', {
    ignore: [
      './node_modules/**', './app/bower_components/**',
      `./app/scripts/require.js`,
      `./app/scripts/math.js`,
      `./app/scripts/${transpileTarget}`,
    ],
  });

  return gulp.src(targets, {base: './'})
    .pipe(eslint(eslintGlobal))
    .pipe(eslint.format())
    .pipe(gulpIf(isFixed, gulp.dest('./')));
});

// Lint typescript
gulp.task('tslint', () => {
  let targets = fastGlob.sync('./**/*.ts', {
    ignore: ['./node_modules/**', './app/bower_components/**', './**/*.d.ts'],
  });

  return gulp.src(targets, {base: './'})
    .pipe(tslint({
      formatter: 'prose',
    }))
    .pipe(tslint.report({
      emitError: false,
    }));
});

// Format typescript
gulp.task('tsfmt', () => {
  let targets = fastGlob.sync('./**/*.ts', {
    ignore: ['./node_modules/**', './app/bower_components/**'],
  });

  return gulp.src(targets, {base: './'})
    .pipe(tsfmt({
      tsfmt: true,
    }))
    .pipe(gulp.dest('.'));
});

// Build typescript
gulp.task('tsbuild', () => {
  let targets = fastGlob.sync('./**/*.ts', {
    ignore: ['./node_modules/**', './app/bower_components/**'],
  });

  return gulp.src(targets, {base: './'})
    .pipe(sourcemaps.init())
    .pipe(tsProject())
    .pipe(sourcemaps.write())
    .pipe(gulp.dest('./app/scripts/'));
});

// Build typescript
gulp.task('ts', cb => {
  runSequence('tsbuild', 'tsfmt', 'tslint', cb);
});

// Watch files for changes & reload
gulp.task('serve', function () {
  browserSync({
    port: 5000,
    notify: false,
    logPrefix: 'PSK',
    snippetOptions: {
      rule: {
        match: '<span id="browser-sync-binding"></span>',
        fn: function (snippet) {
          return snippet;
        },
      },
    },
    // Run as an https by uncommenting 'https: true'
    // Note: this uses an unsigned certificate which on first access
    //       will present a certificate warning in the browser.
    // https: true,
    server: {
      baseDir: ['.tmp', 'app'],
    },
  });

  gulp.watch(['app/**/*.html', '!app/bower_components/**/*'],
    ['eslint', reload]);
  gulp.watch(['app/**/*.js', '!app/bower_components/**/*'],
    ['eslint', reload]);
  gulp.watch(['app/**/*.ts', '!app/bower_components/**/*'],
    ['ts', reload]);
  gulp.watch(['app/styles/**/*.css'], [reload]);
  gulp.watch(['app/scripts/**/*.js'], reload);
});

// Build production files, the default task
gulp.task('default', [], () => {
  throw Error(`default doesn't exist`);
});
