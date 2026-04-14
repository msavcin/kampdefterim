import React from 'react';
import { Stack } from 'expo-router';
import ThemedIcon from '@/components/ThemedIcon';
import ChatNew from '../chat/new';

export default function NewTabWrapper() {
	return (
		<>
			<Stack.Screen options={{ title: 'Sohbet', headerRight: () => (<ThemedIcon name="MessageCircle" size={20} />) }} />
			<ChatNew />
		</>
	);
}
