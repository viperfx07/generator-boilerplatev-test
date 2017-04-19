'use strict';

import path from 'path';
import autoprefixer from 'autoprefixer';
import gulpif from 'gulp-if';
import sprites from 'postcss-sprites';
import assets from 'postcss-assets';
import pxtorem from 'postcss-pxtorem';
import criticalCSS from 'postcss-critical-split';
import rucksack from 'rucksack-css';
import cssnano from 'cssnano';
import fs from 'fs';
import lazypipe from 'lazypipe';

export default function(gulp, plugins, args, config, taskTarget, browserSync, dirs) {
  let entries = config.entries;
  let dest = path.join(taskTarget, dirs.assets, dirs.styles.replace(/^_/, ''));

  // Inlines CSS into HTML, adds media query CSS into the <style> tag of the email, and compresses the HTML
  const inliner = (css) => {
      console.log('inliner');
      var clientCss = fs.readFileSync(css[0]).toString();
      var pipe = lazypipe()
          .pipe(plugins.replace, '<!--<criticalcss>-->', `<style>${clientCss}</style>`);

      return pipe();
  };

  const inline = () => {
      let taskDir =  path.join(taskTarget);
      let critCssPath = path.join(dest, 'critical.css');
      return gulp.src(path.join(taskDir, '**/*.html'))
          .pipe(plugins.changed(critCssPath))
          .pipe(inliner([critCssPath]))
          .pipe(gulp.dest(taskDir))
  };

  const sassTask = (isCritical) => {
    let src = path.join(dirs.source, dirs.styles, isCritical ? 'critical.scss': entries.css);
    return gulp.src(src)
      .pipe(plugins.plumber())
      .pipe(plugins.if(!isCritical, plugins.sourcemaps.init()))
      .pipe(plugins.cssGlobbing({ extensions: ['.scss'] }))
      .pipe(plugins.sass({
        precision: 10,
        includePaths: [
          path.join(dirs.source, dirs.styles),
          path.join(dirs.source, dirs.modules),
          'node_modules/bootstrap-sass/assets/stylesheets'
        ]
      }).on('error', plugins.sass.logError))
      .pipe(plugins.postcss([
          autoprefixer({browsers: ['last 2 version', '> 5%', 'safari 5', 'ios >= 8', 'android 4', 'ie >= 9']}),
          rucksack({reporter: true}),
          pxtorem({replace: false}),
          assets({
            loadPaths: [path.join(dirs.source, dirs.images)]
          }),
          sprites({
            stylesheetPath: dest, 
            spritePath: path.join(taskTarget, dirs.assets, 'img'),
            filterBy: function(image) {
                // Allow only png files
                if (!/\.(png|jpg|bmp|gif|jpeg)$/.test(image.url)) {
                    return Promise.reject();
                }

                return Promise.resolve();
            } 
          }),
          criticalCSS({
            blockTag: 'crit',
            startTag: 'crit:start',
            endTag: 'crit:end',
            output: isCritical ? 'critical' : 'rest'
          }),
          cssnano({
            rebase: false,
            discardComments: {removeAll: true},
            minifyFontValues: true,
            filterOptimiser: true,
            functionOptimiser: true,
            minifyParams: true,
            normalizeUrl: true,
            reduceBackgroundRepeat: true,
            convertValues: true,
            discardEmpty: true,
            minifySelectors: true,
            reduceInitial: true,
            reduceIdents: false,
            mergeRules: false,
          })
        ]))
      .pipe(plugins.rename(function(path) {
        // Remove 'source' directory as well as prefixed folder underscores
        // Ex: 'src/_styles' --> '/styles'
        path.dirname = path.dirname.replace(dirs.source, '').replace('_', '');
      }))
      .pipe(plugins.if(!isCritical, plugins.sourcemaps.write('./')))
      .pipe(gulp.dest(dest))
      .pipe(browserSync.stream({match: '**/*.css'}));
  };

  // Sass compilation
  gulp.task('sass-rest', () =>{
    return sassTask();
  });

  gulp.task('sass-critical', () =>{
    return sassTask(true);
  });

  gulp.task('clone-main', () => {
    let src = path.join(dirs.source, dirs.styles, entries.css);
    let ren = path.join(dirs.source, dirs.styles, 'critical.scss');
    return gulp
        .src(src)
        .pipe(plugins.changed(ren))
        .pipe(plugins.rename(ren))
        .pipe(gulp.dest('.'));
  });

  gulp.task('temp-sass', ['sass-rest', 'clone-main'], () => {
    gulp.start('sass-critical');
  });

  gulp.task('sass', ['temp-sass'], () => {
    return inline();
  });

}