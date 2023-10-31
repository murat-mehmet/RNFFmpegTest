/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import type {PropsWithChildren} from 'react';
import React, {useCallback, useEffect, useState} from 'react';
import {
  Button,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Asset} from 'react-native-image-picker/src/types';
import 'moment-duration-format';
import moment from 'moment';
import {
  FFmpegKit,
  ReturnCode,
  FFmpegKitConfig,
  Statistics,
} from 'ffmpeg-kit-react-native';
import {stat} from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';
import Video from 'react-native-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Video as VideoCompressor } from 'react-native-compressor';

const Colors = {
  black: '#000000',
  white: '#ffffff',
  dark: '#000000',
  lighter: '#ffffff',
}

type SectionProps = PropsWithChildren<{
  title: string;
  description?: string;
}>;
type ExecutionResult =
  | {
      isSuccess: true;
      uri: string;
      fileSize: number;
      duration: number;
    }
  | {
      isSuccess: false;
      errorText: string;
    }
  | null;

let statisticsCallback: (statistics: Statistics) => void;

FFmpegKitConfig.enableStatisticsCallback(statistics =>
  statisticsCallback(statistics),
);

function Section({children, title, description}: SectionProps): JSX.Element {
  return (
    <View style={styles.sectionContainer}>
      <Text
        style={[
          styles.sectionTitle,
          {
            color: Colors.black,
          },
        ]}>
        {title}
      </Text>
      <Text
        style={[
          styles.sectionDescription,
          {
            color: Colors.dark,
          },
        ]}>
        {description}
      </Text>
      {children}
    </View>
  );
}

let start = 0;
function App(): JSX.Element {
  const backgroundStyle = {
    backgroundColor: Colors.lighter,
  };
  const [asset, setAsset] = useState<Asset>();
  const [parameters, setParameters] = useState(
    '-vcodec mpeg4 -crf 0 -preset superfast',
  );
  const [isExecuting, setIsExecuting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ExecutionResult>(null);
  const [playerUri, setPlayerUri] = useState<string>();
  // load parameters from async storage
  useEffect(() => {
    AsyncStorage.getItem('parameters').then(value => {
      if (value) {
        setParameters(value);
      }
    });
  }, []);

  const openFilePicker = useCallback(() => {
    launchImageLibrary({
      mediaType: 'video',
    })
      .then(response => {
        if (!response.didCancel && response.assets?.length) {
          setAsset(response.assets[0]);
        }
      })
      .catch(console.warn);
  }, [setAsset]);
  const startExecution = useCallback(() => {
    if (!asset || !asset.uri) {
      return;
    }
    start = Date.now();
    AsyncStorage.setItem('parameters', parameters);
    setIsExecuting(true);
    setResult(null);
    setProgress(0);
    const ext = '.' + asset.uri.split('.').pop();
    const newAssetUri = asset.uri.replace(ext, '_compressed' + ext);
    const command = `-y -i ${asset.uri} ${parameters} ${newAssetUri}`;
    console.log('Executing with command', command);
    statisticsCallback = (statistics: Statistics) => {
      if (asset.duration) {
        setProgress(
          Math.min(statistics.getTime() / (asset.duration * 1000), 1),
        );
      }
    };
    VideoCompressor.compress(
        asset.uri,
        {
          minimumFileSizeForCompress: 0,
          compressionMethod: 'auto',
        },
        (progress) => {
          setProgress(
              Math.min(progress, 1),
          )
          console.log('Compression Progress: ', progress);
        }
    ).then(async newAssetUri => {
      const fileStat = await stat(newAssetUri)
      setResult({
                isSuccess: true,
                uri: newAssetUri,
                fileSize: fileStat.size,
                duration: (Date.now() - start),
              });
    })
    // FFmpegKit.execute(command)
    //   .then(async session => {
    //     const returnCode = await session.getReturnCode();
    //     if (ReturnCode.isSuccess(returnCode)) {
    //       const fileSize = await stat(newAssetUri).then(
    //         fileInfo => fileInfo.size,
    //       );
    //       const duration = await session.getDuration();
    //       setResult({
    //         isSuccess: true,
    //         uri: newAssetUri,
    //         fileSize,
    //         duration,
    //       });
    //       // SUCCESS
    //     } else if (ReturnCode.isCancel(returnCode)) {
    //       console.log('cancel', returnCode);
    //       // CANCEL
    //     } else {
    //       setResult({
    //         isSuccess: false,
    //         errorText: 'Error while executing command, check logs for details.',
    //       });
    //       console.log('err', returnCode);
    //
    //       // ERROR
    //     }
    //   })
      .catch(console.warn)
      .finally(() => setIsExecuting(false));
  }, [asset, parameters]);
  const openAssetUrl = useCallback(
    (url: string) => () => {
      FileViewer.open(url);
    },
    [],
  );
  const playAssetUrl = useCallback(
    (url: string) => () => {
      setPlayerUri(url);
    },
    [],
  );
  const cancelExecution = useCallback(() => {
    if (isExecuting) {
      FFmpegKit.cancel();
      setResult({
        isSuccess: false,
        errorText: 'Error while executing command, check logs for details.',
      });
      setIsExecuting(false);
    }
  }, [isExecuting]);
  const closePlayer = useCallback(() => {
    setPlayerUri(undefined);
  }, []);

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        style={backgroundStyle}>
        <KeyboardAvoidingView
          behavior={'padding'}
          enabled={Platform.OS === 'ios'}
          style={{
            backgroundColor: Colors.white,
          }}>
          <Text style={styles.header}>FFmpeg Tester</Text>
          <Section title="1. Pick a video">
            <Button
              title="Open picker"
              onPress={openFilePicker}
              color="#841584"
              disabled={isExecuting}
            />
            {asset && asset.uri && (
              <View style={styles.row}>
                <Image source={{uri: asset.uri}} style={styles.previewImage} />
                <View style={{flex: 1}}>
                  {/* Video Size */}
                  {asset.fileSize && (
                    <Text>
                      <Text style={styles.infoTitle}>Size: </Text>
                      {(asset.fileSize / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  )}
                  {/* Video Duration */}
                  {asset.duration && (
                    <Text>
                      <Text style={styles.infoTitle}>Duration: </Text>
                      {moment
                        .duration(asset.duration, 'seconds')
                        .format('mm:ss', {trim: false})}
                    </Text>
                  )}
                  {/* Video Bitrate */}
                  {asset.bitrate && (
                    <Text>
                      <Text style={styles.infoTitle}>Bitrate: </Text>
                      {(asset.bitrate / 1024).toFixed(0)} kbps
                    </Text>
                  )}
                  {/* Video Dimensions */}
                  {asset.width && asset.height && (
                    <Text>
                      <Text style={styles.infoTitle}>Dimensions: </Text>
                      {asset.width + ' x ' + asset.height}
                    </Text>
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-around',
                      marginTop: 8,
                    }}>
                    <Button title={'Open'} onPress={openAssetUrl(asset.uri)} />
                    <Button title={'Play'} onPress={playAssetUrl(asset.uri)} />
                  </View>
                </View>
              </View>
            )}
          </Section>
          <Section title="2. Set parameters">
            <TextInput
              style={styles.textInput}
              placeholder="Enter ffmpeg parameters"
              value={parameters}
              onChangeText={setParameters}
              editable={!isExecuting}
            />
          </Section>
          <Section title="3. Execute">
            {isExecuting && (
              <View style={{marginBottom: 24}}>
                <Text>
                  <Text style={styles.infoTitle}>Executing: </Text>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
            )}
            {result && (
              <View style={{marginBottom: 24}}>
                <Text style={{color: result.isSuccess ? 'green' : 'red'}}>
                  <Text style={styles.infoTitle}>Result: </Text>
                  {result.isSuccess ? 'Success' : result.errorText}
                </Text>
                {result.isSuccess && (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={openAssetUrl(result.uri)}>
                    <Image
                      source={{uri: result.uri}}
                      style={styles.previewImage}
                    />
                    <View style={{flex: 1}}>
                      {/* Video Size */}
                      {result.fileSize && (
                        <Text>
                          <Text style={styles.infoTitle}>Size: </Text>
                          {(result.fileSize / 1024 / 1024).toFixed(2)} MB
                        </Text>
                      )}
                      {/* Video Duration */}
                      {result.duration && (
                        <Text>
                          <Text style={styles.infoTitle}>Execution time: </Text>
                          {moment
                            .duration(result.duration, 'milliseconds')
                            .format('mm:ss', {trim: false})}
                        </Text>
                      )}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-around',
                          marginTop: 8,
                        }}>
                        <Button
                          title={'Open'}
                          onPress={openAssetUrl(result.uri)}
                        />
                        <Button
                          title={'Play'}
                          onPress={playAssetUrl(result.uri)}
                        />
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {!isExecuting ? (
              <Button
                title="Start"
                onPress={startExecution}
                color="#841584"
                disabled={!asset}
              />
            ) : (
              <Button
                title="Cancel"
                onPress={cancelExecution}
                color="#841584"
                disabled={!asset}
              />
            )}
          </Section>
        </KeyboardAvoidingView>
      </ScrollView>

      <Modal
        visible={!!playerUri}
        animationType={'slide'}
        style={{flex: 1}}
        onRequestClose={closePlayer}>
        <Video
          source={{uri: playerUri}}
          style={{flex: 1}}
          controls
          resizeMode="contain"
        />
        <Button title={'Close'} onPress={closePlayer} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  sectionContainer: {
    marginTop: 32,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '600',
  },
  sectionDescription: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '400',
  },
  header: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 32,
  },
  textInput: {
    borderWidth: 1,
    borderColor: 'gray',
    padding: 10,
    borderRadius: 5,
  },
  previewImage: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    borderRadius: 5,
    marginRight: 16,
  },
  row: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'gray',
    padding: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
});

export default App;
