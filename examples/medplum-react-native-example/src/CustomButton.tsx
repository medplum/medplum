import { GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';

interface CustomButtonProps {
  readonly onPress: ((event: GestureResponderEvent) => void) | undefined;
  readonly title: string;
  readonly style?: Record<string, string | boolean | number>;
}

export default function CustomButton(props: CustomButtonProps): JSX.Element {
  const { onPress, title = 'Save', style } = props;
  return (
    <Pressable style={{ ...styles.button, ...style }} onPress={onPress}>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
    borderRadius: 4,
    elevation: 3,
    backgroundColor: '#228be6',
  },
  text: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: 0.25,
    color: 'white',
  },
});
