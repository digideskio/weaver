var gulp = require('gulp');
var path = require('path');
var tap = require('gulp-tap');
var concat = require('gulp-concat');
var uglify = require('gulp-uglify');
var replace = require('gulp-replace');
var inject = require('gulp-inject');
var zip = require('gulp-zip');
var mocha = require('gulp-mocha');
var child_process = require('child_process');
var fs = require('fs');
var htmlmin = require('gulp-htmlmin');
var cssmin = require('gulp-cssmin');
var shell = require('gulp-shell');
var jshint = require('gulp-jshint');
var jshStylish = require('jshint-stylish');
var exec = require('child_process').exec;
var runSequence = require('run-sequence');
var browserify = require('browserify');
var source = require('vinyl-source-stream'); // converts node streams into vinyl streams
var del = require('del');
var vinylPaths = require('vinyl-paths');
var clean = function(){ return vinylPaths(del) };

var version; // used for marking builds w/ version etc

var paths = {
  sources: [
    'src/preamble.js',
    'src/namespace.js',
    'src/promise.js',
    'src/is.js',
    'src/util.js',
    'src/math.js',
    'src/event.js',
    'src/define.js',
    'src/thread.js',
    'src/fabric.js'
  ],

  nodethreadName: 'thread-node-fork.js',
  nodethreadSrc: [
    'src/preamble.js',
    'src/thread-node-fork.js'
  ],

  docs: {
    js: [
      'documentation/js/fastclick.js',
      'documentation/js/jquery.js',
      'documentation/js/weaver.js',
      'documentation/js/script.js'
    ],

    css: [
      'documentation/css/reset.css',
      'documentation/css/font-awesome.css',
      'documentation/css/highlight/github.css',
      'documentation/css/style.css'
    ]
  }
};

// update these if you don't have a unix like env or these programmes aren't in your $PATH
var replaceShellVars = function( cmds ){
  return cmds.map(function( cmd ){
    return cmd
      .replace('$VERSION', version)
      .replace('$GIT', 'git')
      .replace('$CD', 'cd')
      .replace('$RM', 'rm -rf')
      .replace('$CP', 'cp -R')
      .replace('$TEMP_DIR', '/tmp')
      .replace('$DOC_DIR', 'documentation')
      .replace('$DL_DIR', 'download')
      .replace('$NPM', 'npm')
      .replace('$METEOR', 'meteor')
      .replace('$SPM', 'spm')
    ;
  });
};


gulp.task('default', ['build'], function(){

});

gulp.task('version', function( next ){
  var now = new Date();
  version = process.env['VERSION'];

  if( version ){
    done();
  } else {
    exec('git rev-parse HEAD', function( error, stdout, stderr ){
      var sha = stdout.substring(0, 10); // shorten so not huge filename

      version = [ 'snapshot', sha, +now ].join('-');
      done();
    });
  }

  function done(){
    console.log('Using version number `%s` for building', version);

    next();
  }

});

gulp.task('clean', function(){
  return gulp.src(['build'])
    .pipe( clean({ read: false }) )
  ;
});

gulp.task('concat', ['version', 'nodeworker'], function(){
  return gulp.src( paths.sources )
    .pipe( replace('{{VERSION}}', version) )

    .pipe( concat('weaver.js') )

    .pipe( gulp.dest('build') )
  ;
});

gulp.task('build', ['version', 'nodeworker'], function(){
  return gulp.src( paths.sources )
    .pipe( replace('{{VERSION}}', version) )

    .pipe( concat('weaver.js') )

    .pipe( gulp.dest('build') )

    .pipe( uglify({
      mangle: true,

      preserveComments: 'some'
    }) )

    .pipe( concat('weaver.min.js') )

    .pipe( gulp.dest('build') )
  ;
});

gulp.task('nodeworker', function(){
  return gulp.src( paths.nodethreadSrc )
    .pipe( replace('{{VERSION}}', version) )

    .pipe( concat(paths.nodethreadName) )

    .pipe( gulp.dest('build') )
  ;
});

gulp.task('debugrefs', function(){
  return gulp.src('debug/index.html')
    .pipe( inject( gulp.src(paths.sources, { read: false }), {
      addPrefix: '..',
      addRootSlash: false
    } ) )

    .pipe( gulp.dest('debug') )
  ;
});

gulp.task('testrefs', function(){
  return gulp.src('test/index.html')
    .pipe( inject( gulp.src(paths.sources, { read: false }), {
      addPrefix: '..',
      addRootSlash: false
    } ) )

    .pipe( gulp.dest('test') )
  ;
});

gulp.task('testlist', function(){
  return gulp.src('test/index.html')
    .pipe( inject( gulp.src('test/*.js', { read: false }), {
      addPrefix: '',
      ignorePath: 'test',
      addRootSlash: false,
      starttag: '<!-- inject:test:{{ext}} -->'
    } ) )

    .pipe( gulp.dest('test') )
  ;
});

gulp.task('refs', function(next){
  runSequence( 'debugrefs', 'testrefs', 'testlist', next );
});

gulp.task('zip', ['version', 'build'], function(){
  return gulp.src(['build/weaver.js', 'build/weaver.min.js', 'LGPL-LICENSE.txt'])
    .pipe( zip('weaver.js-' + version + '.zip') )

    .pipe( gulp.dest('build') )
  ;
});

gulp.task('test', ['concat'], function(next){
  return gulp.src('test/*.js')
    .pipe( mocha({
      reporter: 'spec'
    }) )
  ;
});

gulp.task('docsver', ['version'], function(){
  return gulp.src('documentation/docmaker.json')
    .pipe( replace(/\"version\"\:\s*\".*?\"/, '"version": "' + version + '"') )

    .pipe( gulp.dest('documentation') )
  ;
});

gulp.task('docsjs', ['version', 'build'], function(){
  return gulp.src([
    'build/weaver.js',
    'build/weaver.min.js',
    'lib/*.js'
  ])
    .pipe( gulp.dest('documentation/js') )

    .pipe( gulp.dest('documentation/api/weaver.js-' + version) )

    .pipe( gulp.dest('documentation/api/weaver.js-latest') )
  ;
});

gulp.task('docsdl', ['version', 'zip'], function(){
  return gulp.src('build/weaver.js-' + version + '.zip')
    .pipe( gulp.dest('documentation/download') )
  ;
});

gulp.task('docsbuildlist', ['docsdl'], function(next){
  var cwd = process.cwd();

  process.chdir('./documentation/download');
  require('./documentation/download/dlmaker')(function(){
    process.chdir( cwd );

    next();
  });

});

gulp.task('snapshotpush', ['docsdl'], shell.task( replaceShellVars([
  '$RM $TEMP_DIR/weaver',
  '$GIT clone -b gh-pages https://github.com/maxkfranz/weaver.git $TEMP_DIR/weaver',
  '$CP $DOC_DIR/$DL_DIR/* $TEMP_DIR/weaver/$DL_DIR',
  '$CD $TEMP_DIR/weaver',
  '$GIT add -A',
  '$GIT commit -a -m "updating list of builds"',
  '$GIT push origin'
]) ));

gulp.task('docs', function(next){
  var cwd = process.cwd();

  process.chdir('./documentation');
  require('./documentation/docmaker')( function(){
    process.chdir( cwd );

    next();
  } );

});

gulp.task('docsmin', function(next){
  runSequence( 'docs', 'docsminrefs', 'docshtmlmin', next );
});

gulp.task('docsclean', function(next){
  return gulp.src(['documentation/js/all.min.js', 'documentation/css/all.min.css', 'documentation/index.html'])
    .pipe( clean({ read: false }) )
  ;
});

gulp.task('docshtmlmin', function(){
  return gulp.src('documentation/index.html')
    .pipe( htmlmin({
      collapseWhitespace: true,
      keepClosingSlash: true
    }) )

    .pipe( gulp.dest('documentation') )
  ;
});

gulp.task('docsjsmin', function(){
  return gulp.src( paths.docs.js )
    .pipe( concat('all.min.js') )

    .pipe( uglify({
      mangle: true
    }) )

    .pipe( gulp.dest('documentation/js') )
  ;
});

gulp.task('docscssmin', function(){
  return gulp.src( paths.docs.css )
    .pipe( concat('all.min.css') )

    .pipe( cssmin() )

    .pipe( gulp.dest('documentation/css') )
  ;
});

gulp.task('docsminrefs', ['docscssmin', 'docsjsmin'], function(){
  return gulp.src('documentation/index.html')
    .pipe( inject( gulp.src([ 'documentation/js/all.min.js', 'documentation/css/all.min.css' ] ), {
      addRootSlash: false,
      ignorePath: 'documentation'
    } ) )

    .pipe( gulp.dest('documentation') )
  ;
});

gulp.task('docsrefs', function(){
  return gulp.src([ 'documentation/index.html', 'documentation/template.html' ])
    .pipe( inject( gulp.src(paths.docs.js.concat( paths.docs.css ), { read: false }), {
      addRootSlash: false,
      ignorePath: 'documentation'
    } ) )

    .pipe( gulp.dest('documentation') )
  ;
});

gulp.task('docsdemoshots', function(next){ return next(); // disable for now since phantomjs doesn't work for this usecase
  var cwd = process.cwd();

  process.chdir('./documentation');
  require('./documentation/demoshots')( function(){
    process.chdir( cwd );

    next();
  } );
});

gulp.task('docspub', function(next){
  runSequence( 'version', 'docsver', 'docsjs', 'docsbuildlist', 'docsdemoshots', 'docsmin', next );
});

gulp.task('docsrebuild', function(next){
  runSequence( 'docsmin', next );
});

gulp.task('pkgver', ['version'], function(){
  return gulp.src([
    'package.json',
    'bower.json'
  ])
    .pipe( replace(/\"version\"\:\s*\".*?\"/, '"version": "' + version + '"') )

    .pipe( gulp.dest('./') )
  ;
});

gulp.task('dist', ['build'], function(){
  return gulp.src([
    'build/weaver.js',
    'build/weaver.min.js',
    'build/' + paths.nodethreadName
  ])
    .pipe( gulp.dest('dist') )
  ;
});

gulp.task('pubprep', function(next){
  runSequence('pkgver', 'dist', 'docspub', next);
});

gulp.task('pubpush', ['version'], shell.task( replaceShellVars([
  '$GIT add -A',
  '$GIT commit -m " preparing to publish $VERSION "',
  '$GIT push'
]) ));

gulp.task('publish', ['pubprep'], function(next){
  runSequence('pubpush', 'tag', 'docspush', 'npm', 'spm', 'meteor', next);
});

gulp.task('tag', shell.task( replaceShellVars([
  '$GIT tag -a v$VERSION -m "v$VERSION"',
  '$GIT push origin v$VERSION'
]) ));

gulp.task('docspush', shell.task( replaceShellVars([
  '$RM $TEMP_DIR/weaver',
  '$GIT clone -b gh-pages https://github.com/maxkfranz/weaver.git $TEMP_DIR/weaver',
  '$CP $DOC_DIR/* $TEMP_DIR/weaver',
  '$CD $TEMP_DIR/weaver',
  '$GIT add -A',
  '$GIT commit -a -m "updating docs to $VERSION"',
  '$GIT push origin'
]) ));

gulp.task('unstabledocspush', shell.task( replaceShellVars([
  '$RM $TEMP_DIR/weaver',
  '$GIT clone -b gh-pages https://github.com/maxkfranz/weaver.git $TEMP_DIR/weaver',
  '$CP $DOC_DIR/* $TEMP_DIR/weaver/unstable',
  '$CD $TEMP_DIR/weaver',
  '$GIT add -A',
  '$GIT commit -a -m "updating unstable docs to $VERSION"',
  '$GIT push origin'
]) ));

// browserify debug build
gulp.task('browserify', ['build'], function(){
  var b = browserify({ debug: true, hasExports: true });

  b.add('./build/weaver.js', { expose: "weaver" });

  return b.bundle()
    .pipe( source('weaver.browserify.js') )
    .pipe( gulp.dest('build') )
  ;
});

gulp.task('npm', shell.task( replaceShellVars([
  '$NPM publish .'
]) ));

gulp.task('meteor', shell.task( replaceShellVars([
  '$METEOR publish'
]) ));

gulp.task('spm', shell.task( replaceShellVars([
  '$SPM publish'
]) ));

gulp.task('watch', function(next){
  var watcher = gulp.watch(paths.sources, ['testrefs','debugrefs']);
  watcher.on('added deleted', function(event){
    console.log('File ' + event.path + ' was ' + event.type + ', updating lib refs in pages...');
  });

  var testWatcher = gulp.watch('test/*.js', ['testlist']);
  testWatcher.on('added deleted', function(event){
    console.log('File ' + event.path + ' was ' + event.type + ', updating test refs in pages...');
  });

  next();
});

// http://www.jshint.com/docs/options/
gulp.task('lint', function(){
  return gulp.src( paths.sources )
    .pipe( jshint({
      funcscope: true,
      laxbreak: true,
      loopfunc: true,
      strict: true,
      unused: 'vars',
      eqnull: true,
      sub: true,
      shadow: true,
      laxcomma: true
    }) )

    .pipe( jshint.reporter(jshStylish) )
  ;
});
