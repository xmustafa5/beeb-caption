// Raises every CocoaPods target to at least the app's iOS deployment target.
//
// Xcode 27 rejects deployment targets below iOS 15.0, and a few pods still
// declare older ones on their resource-bundle targets (SDWebImage 9.0,
// ReachabilitySwift 12.0, RNCAsyncStorage 13.4), which fails the build with
// "The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to
// 9.0, but the range of supported deployment target versions is 15.0 to 27.0.x".
// Pods that declare a newer target are left alone.
//
// Remove once those pods ship podspecs with a deployment target of 15.0+.
const { withPodfile } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const POST_INSTALL_FIX = `    min_ios_target = podfile_properties['ios.deploymentTarget'] || '15.1'
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        next unless current && Gem::Version.correct?(current)
        if Gem::Version.new(current) < Gem::Version.new(min_ios_target)
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = min_ios_target
        end
      end
    end`;

module.exports = function withIosPodsDeploymentTarget(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = mergeContents({
      tag: 'withIosPodsDeploymentTarget',
      src: config.modResults.contents,
      newSrc: POST_INSTALL_FIX,
      anchor: /post_install do \|installer\|/,
      offset: 1,
      comment: '#',
    }).contents;
    return config;
  });
};
