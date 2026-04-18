module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      // Inline nativewind/babel minus the react-native-worklets/plugin.
      // The full nativewind/babel -> react-native-css-interop/babel hardcodes
      // 'react-native-worklets/plugin' which is only compatible with
      // reanimated 4 / RN 0.81+. On SDK 51 (RN 0.74.5 / reanimated 3.10)
      // worklets is baked into reanimated itself, so we skip it.
      require('react-native-css-interop/dist/babel-plugin').default,
      [
        '@babel/plugin-transform-react-jsx',
        { runtime: 'automatic', importSource: 'react-native-css-interop' },
      ],
      // react-native-reanimated plugin MUST be last.
      'react-native-reanimated/plugin',
    ],
  };
};
