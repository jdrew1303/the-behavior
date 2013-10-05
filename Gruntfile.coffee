module.exports = ->
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    # CoffeeScript compilation
    coffee:
      spec:
        options:
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Browser version building
    exec:
      nuke_main:
        command: 'rm -rf ./components/*/'
      bower_install:
        command: './node_modules/.bin/bower install'
      main_install:
        command: './node_modules/.bin/component install'
      main_build:
        command: './node_modules/.bin/component build -u component-json,component-coffee -o browser -n the-behavior -c'

    # Automated recompilation and testing when developing
    watch:
      files: [
        'components/*.coffee'
        'graphs/*.json'
        'component.json'
        'spec/*.coffee'
      ]
      tasks: ['test']

    # BDD tests on browser
    mocha_phantomjs:
      options:
        output: 'spec/result.xml'
        reporter: 'dot'
      all: ['spec/runner.html']

    # Coding standards
    coffeelint:
      # noflo:
      options:
        max_line_length:
          level: "ignore"
      files: [
        'Gruntfile.coffee'
        'components/*.coffee'
        'spec/*.coffee'
      ]

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-exec'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', ['exec']
  @registerTask 'test', ['coffeelint', 'build', 'coffee', 'mocha_phantomjs']
  @registerTask 'default', ['test']
