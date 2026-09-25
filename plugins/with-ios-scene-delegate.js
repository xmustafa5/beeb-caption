// Adopts the UIScene life cycle on iOS.
//
// Apps built with the iOS 27 SDK are terminated at launch (SIGTRAP in
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption) unless they
// declare a UIApplicationSceneManifest. Expo SDK 54's AppDelegate template still
// uses the app-delegate window, so this plugin:
//   1. declares a single-scene manifest in Info.plist, and
//   2. appends a SceneDelegate to AppDelegate.swift that moves the window the
//      AppDelegate already created (and handed to React Native / expo-dev-client)
//      into the connected UIWindowScene.
// Under scenes, UIKit stops calling the app delegate's URL and life-cycle
// methods, so the SceneDelegate forwards those to AppDelegate, which dispatches
// them to Expo's AppDelegate subscribers and RCTLinkingManager as before.
//
// Remove once the project is on an Expo SDK whose template ships a
// SceneDelegate (SDK 58+).
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// @generated withIosSceneDelegate';

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  private var appDelegate: AppDelegate? {
    UIApplication.shared.delegate as? AppDelegate
  }

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene, let appDelegate = appDelegate else {
      return
    }
    let window = appDelegate.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    appDelegate.window = window
    window.makeKeyAndVisible()

    // Cold-launch links arrive here instead of in launchOptions.
    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    for userActivity in connectionOptions.userActivities {
      self.scene(scene, continue: userActivity)
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = appDelegate else {
      return
    }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      options[.openInPlace] = context.options.openInPlace
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = appDelegate?.application(UIApplication.shared, continue: userActivity) { _ in }
  }

  func sceneDidBecomeActive(_ scene: UIScene) {
    appDelegate?.applicationDidBecomeActive(UIApplication.shared)
  }

  func sceneWillResignActive(_ scene: UIScene) {
    appDelegate?.applicationWillResignActive(UIApplication.shared)
  }

  func sceneWillEnterForeground(_ scene: UIScene) {
    appDelegate?.applicationWillEnterForeground(UIApplication.shared)
  }

  func sceneDidEnterBackground(_ scene: UIScene) {
    appDelegate?.applicationDidEnterBackground(UIApplication.shared)
  }
}
`;

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

function withSceneDelegateClass(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('withIosSceneDelegate: expected a Swift AppDelegate.');
    }
    if (!config.modResults.contents.includes(MARKER)) {
      config.modResults.contents = config.modResults.contents.trimEnd() + '\n' + SCENE_DELEGATE;
    }
    return config;
  });
}

module.exports = function withIosSceneDelegate(config) {
  return withSceneDelegateClass(withSceneManifest(config));
};
