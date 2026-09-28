Pod::Spec.new do |s|
  s.name           = 'HealthWrite'
  s.version        = '0.0.1'
  s.summary        = 'Writes a resolved Matrix workout payload into HealthKit'
  s.description    = 'The native half of matrix-workouts-app. Makes no decisions; see src/map/.'
  s.author         = 'Christoph Halang'
  s.homepage       = 'https://github.com/bestimmaa/matrix-workouts-app'
  s.license        = 'MIT'
  # iOS 17: cyclingPower, cyclingCadence and cyclingSpeed do not exist below it.
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
