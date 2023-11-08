import { GestureResponderEvent, Pressable, StyleSheet, Text } from 'react-native';

interface CustomButtonProps {
  onPress: ((event: GestureResponderEvent) => void) | undefined;
  title: string;
}

export default function CustomButton(props: CustomButtonProps): JSX.Element {
  const { onPress, title = 'Save' } = props;
  return (
    <Pressable style={styles.button} onPress={onPress}>
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
