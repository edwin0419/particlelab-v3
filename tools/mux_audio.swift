// 무음 mp4 에 소리를 입힌다 (ffmpeg 없이, macOS 기본 AVFoundation).
//   swift tools/mux_audio.swift <영상.mp4> <소리.m4a> <결과.mp4>
// 영상 · 소리 모두 다시 압축하지 않고 그대로 합친다. mp3 는 먼저 m4a 로 바꿔 넣는다:
//   afconvert -f m4af -d aac -b 192000 voice.mp3 voice.m4a
import AVFoundation
import Foundation

let a = CommandLine.arguments
guard a.count == 4 else { print("사용법: mux_audio.swift 영상.mp4 소리.m4a 결과.mp4"); exit(2) }
let video = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let audio = AVURLAsset(url: URL(fileURLWithPath: a[2]))
let outURL = URL(fileURLWithPath: a[3])
try? FileManager.default.removeItem(at: outURL)

let comp = AVMutableComposition()
guard let vt = video.tracks(withMediaType: .video).first, let at = audio.tracks(withMediaType: .audio).first,
      let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
      let ca = comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else { print("트랙을 읽지 못했습니다"); exit(1) }
do {
    try cv.insertTimeRange(CMTimeRange(start: .zero, duration: video.duration), of: vt, at: .zero)
    try ca.insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(audio.duration, video.duration)), of: at, at: .zero)
} catch { print("합치기 실패: \(error)"); exit(1) }
cv.preferredTransform = vt.preferredTransform

guard let ex = AVAssetExportSession(asset: comp, presetName: AVAssetExportPresetPassthrough) else { print("내보내기 준비 실패"); exit(1) }
ex.outputURL = outURL
ex.outputFileType = .mp4
ex.shouldOptimizeForNetworkUse = true
let sem = DispatchSemaphore(value: 0)
ex.exportAsynchronously { sem.signal() }
sem.wait()
if ex.status == .completed {
    print(String(format: "완료: %@ (영상 %.1f초 · 소리 %.1f초)", a[3], video.duration.seconds, audio.duration.seconds))
} else { print("내보내기 실패: \(String(describing: ex.error))"); exit(1) }
