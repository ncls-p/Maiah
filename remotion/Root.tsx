import { Composition, Folder } from "remotion";

import { MaiahLaunchFilm } from "./MaiahLaunchFilm";
import {
	VIDEO_DURATION,
	VIDEO_FPS,
	VIDEO_HEIGHT,
	VIDEO_WIDTH,
} from "./constants";

export function RemotionRoot() {
	return (
		<Folder name="Maiah">
			<Composition
				id="MaiahLaunchFilm"
				component={MaiahLaunchFilm}
				durationInFrames={VIDEO_DURATION}
				fps={VIDEO_FPS}
				width={VIDEO_WIDTH}
				height={VIDEO_HEIGHT}
			/>
		</Folder>
	);
}
